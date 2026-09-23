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
  league === "euroleague" ? getElTeams() : getEspnTeams(league);

export const getStandings = (league: LeagueId): Promise<Standings> =>
  league === "euroleague" ? getElStandings() : getEspnStandings(league);

export const getGames = (league: LeagueId, view: "results" | "upcoming"): Promise<GamesResponse> =>
  league === "euroleague" ? getElGames(view) : getEspnGames(league, view);

export const getLeaders = (league: LeagueId): Promise<LeadersResponse> =>
  league === "euroleague" ? getElLeaders() : getEspnLeaders(league);

/** L'API EuroLeague n'expose pas d'actualités (voir README). */
export const getNews = (league: LeagueId): Promise<NewsItem[]> =>
  league === "euroleague" ? Promise.resolve([]) : getEspnNews(league);

export const getRecent = (league: LeagueId, id: string): Promise<Game[]> =>
  league === "euroleague" ? getElRecent(id) : getEspnRecent(league, id);

export async function getTeamDetail(league: LeagueId, id: string): Promise<TeamDetail> {
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
  }
  return detail;
}

/** Vue agrégée « aujourd'hui » pour l'accueil. */
export async function getToday(): Promise<TodayResponse> {
  const settled = await Promise.allSettled(
    LEAGUE_IDS.map((l) => (l === "euroleague" ? getElToday() : getEspnToday(l))),
  );
  const leagues: TodayLeague[] = settled.map((s, i) =>
    s.status === "fulfilled" ? s.value : { league: LEAGUE_IDS[i], games: [] },
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
