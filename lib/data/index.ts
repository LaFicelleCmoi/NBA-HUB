import "server-only";
import {
  getEspnGames,
  getEspnLeaders,
  getEspnNews,
  getEspnRecent,
  getEspnStandings,
  getEspnTeamDetail,
  getEspnTeams,
  getEspnToday,
} from "@/lib/api/espn";
import {
  getElGames,
  getElLeaders,
  getElRecent,
  getElStandings,
  getElTeamDetail,
  getElTeams,
  getElToday,
} from "@/lib/api/euroleague";
import { withFallback } from "@/lib/api/fallback";
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
  TodayLeague,
  TodayResponse,
} from "@/types";

/**
 * Service de données : point d'entrée unique utilisé par les Route Handlers
 * (/api/...) et par les Server Components. Aucun composant client n'appelle
 * d'API tierce : le navigateur ne voit que /api/*.
 */

export const getTeams = (league: LeagueId): Promise<Team[]> =>
  withFallback(`teams:${league}`, () => (league === "euroleague" ? getElTeams() : getEspnTeams(league)));

export const getStandings = (league: LeagueId): Promise<Standings> =>
  withFallback(`standings:${league}`, () => (league === "euroleague" ? getElStandings() : getEspnStandings(league)));

export const getGames = (league: LeagueId, view: "results" | "upcoming"): Promise<GamesResponse> =>
  withFallback(`games:${league}:${view}`, () =>
    league === "euroleague" ? getElGames(view) : getEspnGames(league, view),
  );

export const getLeaders = (league: LeagueId): Promise<LeadersResponse> =>
  withFallback(`leaders:${league}`, () => (league === "euroleague" ? getElLeaders() : getEspnLeaders(league)));

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
  withFallback(`team:${league}:${id}`, () => fetchTeamDetail(league, id));

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
