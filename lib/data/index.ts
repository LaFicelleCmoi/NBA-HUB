import "server-only";
import {
  getEspnGames,
  getEspnLeaders,
  getEspnNews,
  getEspnRecent,
  getEspnStandings,
  getEspnTeamDetail,
  getEspnTeamForm,
  getEspnTeams,
  getEspnToday,
} from "@/lib/api/espn";
import {
  getElGames,
  getElLeaders,
  getElRecent,
  getElStandings,
  getElTeamDetail,
  getElTeamForm,
  getElTeams,
  getElToday,
} from "@/lib/api/euroleague";
import { withFallback } from "@/lib/api/fallback";
import bundledTeams from "@/lib/data/teams.json";
import bundledStandings from "@/lib/data/standings.json";
import bundledLeaders from "@/lib/data/leaders.json";
import bundledDetails from "@/lib/data/team-details.json";
import bundledTitles from "@/lib/data/titles.json";
import { fetchRss } from "@/lib/api/rss";
import { env, REVALIDATE } from "@/lib/env";
import { LEAGUE_IDS } from "@/lib/leagues";
import { parisDayKey } from "@/lib/time";
import type {
  Game,
  GamesResponse,
  LeadersResponse,
  LeagueId,
  NewsItem,
  Standings,
  Team,
  TeamDetail,
  TeamSummary,
  TodayLeague,
  TodayResponse,
} from "@/types";

/**
 * Service de données : point d'entrée unique utilisé par les Route Handlers
 * (/api/...) et par les Server Components. Aucun composant client n'appelle
 * d'API tierce : le navigateur ne voit que /api/*.
 */

/**
 * Ossature relevée chez les fournisseurs et versionnée dans le dépôt
 * (`scripts/snapshot.mjs`). Elle ne remplace jamais une réponse amont réussie :
 * elle prend le relais quand l'amont se tait, pour que le site montre des
 * données réelles plutôt qu'une page d'erreur.
 */
const bundled = {
  teams: bundledTeams as Record<LeagueId, Team[]>,
  standings: bundledStandings as unknown as Record<LeagueId, Standings>,
  leaders: bundledLeaders as unknown as Record<LeagueId, LeadersResponse>,
  details: bundledDetails as unknown as Record<LeagueId, Record<string, Omit<TeamDetail, "recent" | "upcoming">>>,
};

/**
 * Palmarès d'une équipe, du plus récent au plus ancien. Aucune de nos API ne
 * publie cette donnée : elle est relevée sur Wikidata et chez ESPN par
 * `scripts/titles.mjs`, puis versionnée. Une ligue sans palmarès relevé rend
 * un tableau vide, et la section correspondante disparaît.
 */
export function getTitles(league: LeagueId, id: string): number[] {
  const byLeague = bundledTitles as Partial<Record<LeagueId, Record<string, number[]>>>;
  return byLeague[league]?.[id] ?? [];
}

/** Journalise pourquoi on bascule sur le dépôt, sans masquer la cause. */
function logBundled(what: string, err: unknown) {
  const cause = err instanceof Error ? err.message : "réponse vide";
  console.warn(`[repli-depot] ${what} : ${cause} — données du dépôt servies.`);
}

/**
 * Liste des équipes : c'est l'ossature du site (grille de l'accueil, sélecteur
 * d'équipe favorite, liste blanche de validation des identifiants). Elle ne
 * change qu'une fois par an, alors qu'une API muette la faisait disparaître
 * entièrement — le visiteur se retrouvait sans aucune équipe NBA ni WNBA.
 *
 * Elle est donc versionnée dans le dépôt (`teams.json`, relevée chez les
 * fournisseurs) et sert de repli : l'amont ne fait que la rafraîchir.
 */
export const getTeams = (league: LeagueId): Promise<Team[]> =>
  withFallback(`teams:${league}`, async () => {
    try {
      const live = league === "euroleague" ? await getElTeams() : await getEspnTeams(league);
      if (live.length > 0) return live;
      logBundled(`equipes ${league}`, null);
    } catch (err) {
      logBundled(`equipes ${league}`, err);
    }
    return bundled.teams[league];
  });

export const getStandings = (league: LeagueId): Promise<Standings> =>
  withFallback(`standings:${league}`, async () => {
    try {
      const live = league === "euroleague" ? await getElStandings() : await getEspnStandings(league);
      if (live.groups.some((g) => g.rows.length > 0)) return live;
      logBundled(`classement ${league}`, null);
    } catch (err) {
      logBundled(`classement ${league}`, err);
    }
    return bundled.standings[league];
  });

export const getGames = (league: LeagueId, view: "results" | "upcoming"): Promise<GamesResponse> =>
  withFallback(`games:${league}:${view}`, () =>
    league === "euroleague" ? getElGames(view) : getEspnGames(league, view),
  );

export const getLeaders = (league: LeagueId): Promise<LeadersResponse> =>
  withFallback(`leaders:${league}`, async () => {
    try {
      const live = league === "euroleague" ? await getElLeaders() : await getEspnLeaders(league);
      if (live.leaders.some((l) => l.entries.length > 0)) return live;
      logBundled(`leaders ${league}`, null);
    } catch (err) {
      logBundled(`leaders ${league}`, err);
    }
    return bundled.leaders[league];
  });

/**
 * Actualités : médias francophones en priorité (BasketUSA, BasketEurope),
 * complétés par des sources anglophones (ESPN, Eurohoops). Chaque source est
 * indépendante : si l'une tombe, les autres restent affichées.
 */
export const getNews = (league: LeagueId): Promise<NewsItem[]> =>
  withFallback(`news:${league}`, () => fetchNews(league));

async function fetchNews(league: LeagueId): Promise<NewsItem[]> {
  const sources: Promise<NewsItem[]>[] =
    league === "euroleague"
      ? [
          fetchRss(env.newsEuroleagueFr, "BasketEurope", "fr", REVALIDATE.news),
          fetchRss(env.newsEuroleagueEn, "Eurohoops", "en", REVALIDATE.news),
        ]
      : [
          // Chaque article BasketUSA commence par sa rubrique : « NBA – … », « WNBA – … », « Sneakers – … ».
          fetchRss(env.newsBasketUsa, "BasketUSA", "fr", REVALIDATE.news).then((items) =>
            items.filter((n) => (league === "wnba" ? /^WNBA\b/ : /^NBA\b/).test(n.description ?? "")),
          ),
          getEspnNews(league),
        ];
  const settled = await Promise.allSettled(sources);
  const items = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (items.length === 0 && settled.every((s) => s.status === "rejected")) throw new Error("news unavailable");
  const seen = new Set<string>();
  return items
    .filter((n) => (seen.has(n.url) ? false : (seen.add(n.url), true)))
    // Site francophone : articles en français d'abord, puis les plus récents.
    .sort((a, b) => (a.lang === b.lang ? b.published.localeCompare(a.published) : a.lang === "fr" ? -1 : 1))
    .slice(0, 24);
}

export const getRecent = (league: LeagueId, id: string): Promise<Game[]> =>
  withFallback(`recent:${league}:${id}`, () =>
    league === "euroleague" ? getElRecent(id) : getEspnRecent(league, id),
  );

export const getTeamDetail = (league: LeagueId, id: string): Promise<TeamDetail> =>
  withFallback(`team:${league}:${id}`, async () => {
    try {
      return await fetchTeamDetail(league, id);
    } catch (err) {
      const durable = bundled.details[league]?.[id];
      if (!durable) throw err;
      logBundled(`equipe ${league}/${id}`, err);
      // Les matchs ne sont pas versionnés (ils se périment en quelques heures) :
      // la page affiche ses messages « aucun match » plutôt qu'une affiche fausse.
      return { ...durable, recent: [], upcoming: [] };
    }
  });

async function fetchTeamDetail(league: LeagueId, id: string): Promise<TeamDetail> {
  const [detail, standings] = await Promise.all([
    league === "euroleague" ? getElTeamDetail(id) : getEspnTeamDetail(league, id),
    getStandings(league).catch(() => null),
  ]);
  const row = standings?.groups.flatMap((g) => g.rows.map((r) => ({ r, g: g.name }))).find((x) => x.r.team.id === id);
  if (row) {
    const where = league === "euroleague" ? "au classement" : `de la conférence ${row.g}`;
    detail.standingSummary = `${row.r.rank}${row.r.rank === 1 ? "er" : "e"} ${where} · ${row.r.wins}-${row.r.losses}${
      standings?.isPreviousSeason ? ` (saison ${standings.season})` : ""
    }`;
    detail.team.conference = row.r.team.conference;
    // Bilans détaillés (domicile, extérieur, conférence, 10 derniers…) : ESPN
    // ne les publie que dans le classement, pas sur la fiche d'équipe.
    if (row.r.detail?.length) detail.records = row.r.detail;
  }
  return detail;
}

/**
 * Résumé d'une équipe pour la carte « Mon équipe » : rang, bilan, forme et
 * prochaine affiche. Volontairement séparé de getTeamDetail, qui charge en
 * plus l'effectif et les statistiques — inutiles ici, et bien plus lourds.
 */
export const getTeamSummary = (league: LeagueId, id: string): Promise<TeamSummary> =>
  withFallback(`summary:${league}:${id}`, async () => {
    const [form, standings, teams] = await Promise.all([
      league === "euroleague" ? getElTeamForm(id) : getEspnTeamForm(league, id),
      getStandings(league).catch(() => null),
      getTeams(league).catch(() => [] as Team[]),
    ]);

    const group = standings?.groups.find((g) => g.rows.some((r) => r.team.id === id));
    const row = group?.rows.find((r) => r.team.id === id);
    const team =
      row?.team ??
      teams.find((t) => t.id === id) ??
      form.recent[0]?.home.team ??
      form.next?.home.team;
    if (!team) throw new Error("unknown team");

    return {
      team,
      rank: row?.rank,
      groupSize: group?.rows.length,
      groupName: group?.name,
      wins: row?.wins,
      losses: row?.losses,
      played: row?.played,
      season: standings?.season,
      isPreviousSeason: standings?.isPreviousSeason,
      recent: form.recent,
      next: form.next,
    };
  });

/** Prochaine journée complète (8 matchs max), complétée jusqu'à 6 matchs si elle est courte. */
function nextSlate(games: Game[]): Game[] {
  if (!games.length) return [];
  const day = parisDayKey(games[0].date);
  const slate = games.filter((g) => parisDayKey(g.date) === day);
  return (slate.length >= 6 ? slate : games.slice(0, 6)).slice(0, 8);
}

/** Vue agrégée « aujourd'hui » pour l'accueil. */
export const getToday = (): Promise<TodayResponse> => withFallback("today", fetchToday);

async function fetchToday(): Promise<TodayResponse> {
  const settled = await Promise.allSettled(
    LEAGUE_IDS.map((l) => (l === "euroleague" ? getElToday() : getEspnToday(l))),
  );
  const leagues: TodayLeague[] = settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { league: LEAGUE_IDS[i], games: [] },
  );

  // Pas de match aujourd'hui (inter-saison, jour de repos) : on montre quand même
  // la dernière journée jouée et la prochaine journée programmée.
  await Promise.all(
    leagues.map(async (l) => {
      if (l.games.length > 0) return;
      const [results, upcoming] = await Promise.allSettled([getGames(l.league, "results"), getGames(l.league, "upcoming")]);
      if (results.status === "fulfilled") l.lastGames = results.value.games.slice(0, 6);
      if (upcoming.status === "fulfilled") l.nextGames = nextSlate(upcoming.value.games);
    }),
  );

  const [teams, standings] = await Promise.all([
    Promise.allSettled(LEAGUE_IDS.map(getTeams)),
    Promise.allSettled(LEAGUE_IDS.map(getStandings)),
  ]);

  const allGames = leagues.flatMap((l) => l.games);
  const pointsToday = allGames
    .filter((g) => g.status === "live" || g.status === "final")
    .reduce((s, g) => s + (g.home.score ?? 0) + (g.away.score ?? 0), 0);
  let seasonPoints = 0;
  let seasonGames = 0;
  for (const s of standings) {
    if (s.status !== "fulfilled") continue;
    seasonPoints += s.value.totals.points;
    seasonGames += s.value.totals.games;
  }

  return {
    date: parisDayKey(),
    leagues,
    stats: {
      leagues: LEAGUE_IDS.length,
      teams: teams.reduce((n, t) => n + (t.status === "fulfilled" ? t.value.length : 0), 0),
      gamesToday: allGames.length,
      pointsToday,
      seasonPoints,
      seasonGames,
      avgPerGame: seasonGames ? Math.round((seasonPoints / seasonGames) * 10) / 10 : 0,
    },
  };
}
