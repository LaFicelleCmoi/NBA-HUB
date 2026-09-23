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

export const getTeams = (league: LeagueId): Promise<Team[]> => getEspnTeams(league);

export const getStandings = (league: LeagueId): Promise<Standings> => getEspnStandings(league);

export const getGames = (league: LeagueId, view: "results" | "upcoming"): Promise<GamesResponse> =>
  getEspnGames(league, view);

export const getLeaders = (league: LeagueId): Promise<LeadersResponse> => getEspnLeaders(league);

/**
 * Actualités : média francophone en priorité (BasketUSA), complété par ESPN.
 * Chaque source est indépendante : si l'une tombe, l'autre reste affichée.
 */
export async function getNews(league: LeagueId): Promise<NewsItem[]> {
  const sources: Promise<NewsItem[]>[] = [
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

export const getRecent = (league: LeagueId, id: string): Promise<Game[]> => getEspnRecent(league, id);

export async function getTeamDetail(league: LeagueId, id: string): Promise<TeamDetail> {
  const [detail, standings] = await Promise.all([
    getEspnTeamDetail(league, id),
    getStandings(league).catch(() => null),
  ]);
  const row = standings?.groups.flatMap((g) => g.rows.map((r) => ({ r, g: g.name }))).find((x) => x.r.team.id === id);
  if (row) {
    const where = `de la conférence ${row.g}`;
    detail.standingSummary = `${row.r.rank}${row.r.rank === 1 ? "er" : "e"} ${where} · ${row.r.wins}-${row.r.losses}${
      standings?.isPreviousSeason ? ` (saison ${standings.season})` : ""
    }`;
    detail.team.conference = row.r.team.conference;
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
export async function getToday(): Promise<TodayResponse> {
  const settled = await Promise.allSettled(LEAGUE_IDS.map((l) => getEspnToday(l)));
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
