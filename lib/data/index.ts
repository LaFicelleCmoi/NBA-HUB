import "server-only";
import {
  getEspnGameDetail,
  getEspnPlayer,
  getEspnGames,
  getEspnLeaders,
  getEspnNews,
  getEspnPlayoffs,
  getEspnPreseasonStandings,
  getEspnRecent,
  getEspnStandings,
  getEspnTeamDetail,
  getEspnTeamForm,
  getEspnTeams,
  getEspnToday,
  searchEspnPlayers,
} from "@/lib/api/espn";
import {
  getElGameDetail,
  getElGames,
  getElLeaders,
  getElPlayers,
  getElPlayoffs,
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
import bundledConferenceTitles from "@/lib/data/conference-titles.json";
import { fetchRss } from "@/lib/api/rss";
import { env, REVALIDATE } from "@/lib/env";
import { LEAGUE_IDS } from "@/lib/leagues";
import { parisDayKey } from "@/lib/time";
import type {
  Game,
  GameDetail,
  GamesResponse,
  LeadersResponse,
  LeagueId,
  NewsItem,
  PlayerProfile,
  SearchPlayer,
  SearchResponse,
  Playoffs,
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

type Palmares = Partial<Record<LeagueId, Record<string, number[]>>>;

/**
 * Palmarès d'une équipe, du plus récent au plus ancien. Aucune de nos API ne
 * publie cette donnée : elle est relevée sur Wikipédia par
 * `scripts/titles.mjs`, puis versionnée. Une ligue sans palmarès relevé rend
 * un tableau vide, et la section correspondante disparaît.
 */
export function getTitles(league: LeagueId, id: string): number[] {
  return (bundledTitles as Palmares)[league]?.[id] ?? [];
}

/**
 * Titres de conférence, relevés par le même script : NBA depuis 1971, WNBA
 * de 1999 à 2015 — les seules saisons où la finale opposait les champions des
 * deux conférences.
 */
export function getConferenceTitles(league: LeagueId, id: string): number[] {
  return (bundledConferenceTitles as Palmares)[league]?.[id] ?? [];
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

/**
 * Classement de présaison (NBA, WNBA). L'EuroLeague n'a pas de présaison
 * officielle : `null`, comme tant qu'aucun match de présaison n'est terminé.
 */
export const getPreseasonStandings = (league: LeagueId): Promise<Standings | null> =>
  league === "euroleague"
    ? Promise.resolve(null)
    : withFallback(`preseason:${league}`, () => getEspnPreseasonStandings(league));

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

/**
 * Tableau de phase finale : séries, vainqueurs, champion.
 *
 * Repli sur la dernière valeur connue : un tableau vieux de quelques minutes
 * reste juste entre deux fins de match, et vaut mieux qu'une erreur.
 */
export const getPlayoffs = (league: LeagueId): Promise<Playoffs> =>
  withFallback(`playoffs:${league}`, () => (league === "euroleague" ? getElPlayoffs() : getEspnPlayoffs(league)));

/**
 * Page d'un match : en-tête et play-by-play.
 *
 * Sans repli sur la dernière valeur connue : un déroulé figé présenté comme
 * « en direct » tromperait plus qu'une erreur franche.
 */
export const getGameDetail = (league: LeagueId, id: string): Promise<GameDetail> =>
  league === "euroleague" ? getElGameDetail(id) : getEspnGameDetail(league, id);

/**
 * Fiche d'un joueur NBA ou WNBA. L'EuroLeague n'a pas d'équivalent (ni bio
 * détaillée ni carrière saison par saison) : la fonction rend `null`, et la
 * page répond 404. En cas de panne, la dernière fiche obtenue est resservie.
 */
export const getPlayer = (league: LeagueId, id: string): Promise<PlayerProfile | null> =>
  league === "euroleague" ? Promise.resolve(null) : withFallback(`player:${league}:${id}`, () => getEspnPlayer(league, id));

/**
 * Matchs en cours d'une ligue, pour le classement provisoire.
 *
 * Pas de repli sur le dépôt ici : un match « en direct » vieux de plusieurs
 * heures serait pire que pas de match du tout. En cas de panne, le classement
 * officiel s'affiche seul.
 */
export async function getLiveGames(league: LeagueId): Promise<Game[]> {
  try {
    const today = league === "euroleague" ? await getElToday() : await getEspnToday(league);
    return today.games.filter((g) => g.status === "live");
  } catch {
    return [];
  }
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

/* ------------------------------- Recherche ------------------------------- */

/** Comparaison sans accents ni casse : « nimes » trouve « Nîmes », « doncic » trouve « Dončić ». */
const plat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** 0 : le nom commence par la requête, 1 : un mot du nom, 2 : ailleurs, 3 : pas dans le nom (surnom). */
function proximite(nom: string, q: string): number {
  const n = plat(nom);
  if (n.startsWith(q)) return 0;
  if (n.split(/[\s.'-]+/).some((m) => m.startsWith(q))) return 1;
  return n.includes(q) ? 2 : 3;
}

/**
 * Recherche dans tout le site : clubs des trois ligues et joueurs.
 *
 * Les clubs sont cherchés dans nos propres listes (nom, ville, abréviation).
 * Les joueurs NBA et WNBA viennent de la recherche ESPN, qui connaît aussi
 * les retraités et les surnoms ; ceux de l'EuroLeague, des effectifs des
 * clubs. Chaque source peut manquer sans priver des autres.
 */
export async function search(query: string): Promise<SearchResponse> {
  const q = plat(query.trim());
  const [listes, espn, el] = await Promise.all([
    Promise.all(LEAGUE_IDS.map((l) => getTeams(l).catch(() => [] as Team[]))),
    searchEspnPlayers(query.trim()).catch(() => [] as SearchPlayer[]),
    getElPlayers().catch(() => [] as SearchPlayer[]),
  ]);

  const teams = listes
    .flat()
    .filter((t) =>
      [t.name, t.shortName, t.abbreviation, t.location ?? ""].some(
        (v) => plat(v).includes(q) || (v.length <= 4 && plat(v) === q),
      ),
    )
    .sort((a, b) => proximite(a.name, q) - proximite(b.name, q) || a.name.localeCompare(b.name, "fr"))
    .slice(0, 8);

  const joueursEl = el.filter((p) => plat(p.name).includes(q));
  // Tri stable : prénom ou nom, c'est pareil (« jordan » doit trouver Michael
  // Jordan avant Jordan Poole, comme le classe ESPN) ; à proximité égale,
  // l'ordre de pertinence d'ESPN est conservé.
  const players = [...espn, ...joueursEl]
    .map((p, i) => ({ p, i, d: Math.max(1, proximite(p.name, q)) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((x) => x.p)
    .slice(0, 20);

  return { query: query.trim(), teams, players };
}
