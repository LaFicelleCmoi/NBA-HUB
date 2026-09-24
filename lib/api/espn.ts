import "server-only";
import { env, REVALIDATE } from "@/lib/env";
import { cachedNormalized, fetchJson, fetchJsonSafe } from "@/lib/api/http";
import {
  normalizeEvent,
  normalizeLeaders,
  normalizeNews,
  normalizeRoster,
  normalizeStandings,
  normalizeTeam,
  normalizeTeamStats,
  type RawEspnEvent,
  type RawEspnLeaders,
  type RawEspnNews,
  type RawEspnRoster,
  type RawEspnTeam,
  type RawEspnTeamStats,
  type RawStandingsNode,
} from "@/lib/normalize/espn";
import { addDays, addMonths, espnDay, espnMonth, parisDayKey } from "@/lib/time";
import type {
  Game,
  GamesResponse,
  LeadersResponse,
  NewsItem,
  Standings,
  Team,
  TeamDetail,
  TodayLeague,
} from "@/types";

export type EspnLeague = "nba" | "wnba";

interface RawScoreboard {
  events?: RawEspnEvent[];
  leagues?: { calendar?: string[]; season?: { year?: number; displayName?: string } }[];
}

interface RawSchedule {
  events?: RawEspnEvent[];
  requestedSeason?: { year?: number; displayName?: string };
}

const site = (l: EspnLeague) => `${env.espnSiteApi}/${l}`;

/* ---------------------------------- Équipes --------------------------------- */

export async function getEspnTeams(league: EspnLeague): Promise<Team[]> {
  const raw = await fetchJson<{
    sports?: { leagues?: { teams?: { team: RawEspnTeam }[] }[] }[];
  }>(`${site(league)}/teams`, REVALIDATE.teams);
  const teams = raw.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams
    .map((t) => t.team)
    .filter((t) => t.isActive !== false)
    .map((t) => normalizeTeam(t, league))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/* -------------------------------- Scoreboard -------------------------------- */

async function scoreboard(league: EspnLeague, dates: string | null, revalidate: number | "no-store") {
  const qs = dates ? `?dates=${dates}${dates.length === 6 ? "&limit=1000" : ""}` : "";
  return fetchJson<RawScoreboard>(`${site(league)}/scoreboard${qs}`, revalidate);
}

/** Tous les matchs d'un mois (réponse brute trop lourde pour le Data Cache). */
const monthGamesLive = cachedNormalized(
  async (league: EspnLeague, month: string) =>
    ((await scoreboard(league, month, "no-store")).events ?? []).map((e) => normalizeEvent(e, league)),
  "espn-month-live",
  REVALIDATE.live,
);
const monthGames = cachedNormalized(
  async (league: EspnLeague, month: string) =>
    ((await scoreboard(league, month, "no-store")).events ?? []).map((e) => normalizeEvent(e, league)),
  "espn-month",
  REVALIDATE.schedule,
);

const byDateAsc = (a: Game, b: Game) => a.date.localeCompare(b.date);
const byDateDesc = (a: Game, b: Game) => b.date.localeCompare(a.date);

/**
 * Matchs du jour au sens de Paris : un match joué le soir aux États-Unis
 * tombe dans la nuit française, on interroge donc les deux jours ESPN
 * couvrant la journée parisienne puis on filtre.
 */
export async function getEspnToday(league: EspnLeague): Promise<TodayLeague> {
  const now = new Date();
  const today = parisDayKey(now);
  const [prev, cur, next] = await Promise.all([
    scoreboard(league, espnDay(addDays(now, -1)), REVALIDATE.live),
    scoreboard(league, espnDay(now), REVALIDATE.live),
    scoreboard(league, null, REVALIDATE.live),
  ]);

  const seen = new Set<string>();
  const games: Game[] = [];
  for (const ev of [...(prev.events ?? []), ...(cur.events ?? [])]) {
    if (seen.has(ev.id) || parisDayKey(ev.date) !== today) continue;
    seen.add(ev.id);
    games.push(normalizeEvent(ev, league));
  }
  games.sort(byDateAsc);

  let nextGame: Game | undefined;
  const upcoming = (next.events ?? [])
    .map((e) => normalizeEvent(e, league))
    .filter((g) => g.status === "scheduled" && parisDayKey(g.date) > today)
    .sort(byDateAsc);
  nextGame = upcoming[0];
  if (!nextGame) {
    const nextDay = next.leagues?.[0]?.calendar?.find((d) => d.slice(0, 10) > today);
    if (nextDay) {
      const sb = await scoreboard(league, nextDay.slice(0, 10).replaceAll("-", ""), REVALIDATE.schedule);
      nextGame = (sb.events ?? []).map((e) => normalizeEvent(e, league)).sort(byDateAsc)[0];
    }
  }
  return { league, games, nextGame };
}

/* ------------------------- Résultats et calendrier -------------------------- */

const MAX_GAMES = 40;

export async function getEspnGames(league: EspnLeague, view: "results" | "upcoming"): Promise<GamesResponse> {
  const now = new Date();
  const games: Game[] = [];
  const step = view === "results" ? -1 : 1;
  const maxMonths = view === "results" ? 8 : 4;

  for (let i = 0; i < maxMonths && games.length < MAX_GAMES; i++) {
    const month = addMonths(now, i * step);
    const list = await (i === 0 ? monthGamesLive : monthGames)(league, espnMonth(month));
    if (view === "results") games.push(...list.filter((g) => g.status === "final").sort(byDateDesc));
    else games.push(...list.filter((g) => g.status !== "final").sort(byDateAsc));
  }

  const out = games.slice(0, MAX_GAMES);
  let note: string | undefined;
  if (view === "results" && out[0] && now.getTime() - new Date(out[0].date).getTime() > 21 * 86_400_000)
    note = "Inter-saison : voici les derniers résultats de la saison précédente.";
  if (view === "upcoming" && out.length === 0) note = "Le calendrier de la prochaine saison n'est pas encore publié.";
  return { league, view, games: out, note };
}

/* -------------------------------- Classements ------------------------------- */

export async function getEspnStandings(league: EspnLeague): Promise<Standings> {
  const base = `${env.espnStandingsApi}/${league}/standings`;
  const current = await fetchJson<RawStandingsNode>(base, REVALIDATE.standings);
  const norm = normalizeStandings(current, league);
  if (norm.totals.games > 0 || !current.season?.year) return { league, isPreviousSeason: false, ...norm };

  // Saison pas encore commencée : on affiche la dernière saison terminée.
  const prevYear = current.season.year - 1;
  const prev = await fetchJsonSafe<RawStandingsNode>(`${base}?season=${prevYear}&seasontype=2`, REVALIDATE.standings);
  if (!prev) return { league, isPreviousSeason: false, ...norm };
  return { league, isPreviousSeason: true, ...normalizeStandings(prev, league) };
}

/* ---------------------------------- Leaders --------------------------------- */

export const getEspnLeaders = cachedNormalized(
  async (league: EspnLeague): Promise<LeadersResponse> => {
    const raw = await fetchJson<RawEspnLeaders>(`${env.espnWebApi}/${league}/leaders?limit=10`, "no-store");
    return { league, season: raw.requestedSeason?.displayName ?? "", leaders: normalizeLeaders(raw, league) };
  },
  "espn-leaders",
  REVALIDATE.leaders,
);

/* ----------------------------------- News ----------------------------------- */

export async function getEspnNews(league: EspnLeague): Promise<NewsItem[]> {
  const raw = await fetchJson<RawEspnNews>(`${site(league)}/news?limit=18`, REVALIDATE.news);
  return normalizeNews(raw);
}

/* ---------------------------------- Équipe ---------------------------------- */

async function teamSchedule(league: EspnLeague, id: string) {
  const base = `${site(league)}/teams/${id}/schedule`;
  const def = await fetchJson<RawSchedule>(base, REVALIDATE.schedule);
  const year = def.requestedSeason?.year;
  const pull = (y: number) =>
    Promise.all([
      fetchJsonSafe<RawSchedule>(`${base}?season=${y}&seasontype=2`, REVALIDATE.schedule),
      fetchJsonSafe<RawSchedule>(`${base}?season=${y}&seasontype=3`, REVALIDATE.schedule),
    ]);

  const collect = (lists: (RawSchedule | null)[]) => {
    const map = new Map<string, Game>();
    for (const l of lists) for (const e of l?.events ?? []) map.set(e.id, normalizeEvent(e, league));
    return [...map.values()];
  };

  let all = collect([def, ...(year ? await pull(year) : [])]);
  let season = def.requestedSeason?.displayName ?? "";
  const upcoming = all.filter((g) => g.status === "scheduled" || g.status === "live").sort(byDateAsc);
  let recent = all.filter((g) => g.status === "final").sort(byDateDesc);

  if (recent.length === 0 && year) {
    const prev = await pull(year - 1);
    all = collect(prev);
    recent = all.filter((g) => g.status === "final").sort(byDateDesc);
    season = prev.find((p) => p?.requestedSeason?.displayName)?.requestedSeason?.displayName ?? season;
  }
  return { recent, upcoming, season };
}

export async function getEspnRecent(league: EspnLeague, id: string): Promise<Game[]> {
  const { recent } = await teamSchedule(league, id);
  return recent.slice(0, 5);
}

/** Forme et prochaine affiche seules : inutile de charger effectif et statistiques. */
export async function getEspnTeamForm(league: EspnLeague, id: string) {
  const { recent, upcoming } = await teamSchedule(league, id);
  return { recent: recent.slice(0, 5), next: upcoming[0] };
}

/** Salle du club : « State Farm Arena — Atlanta, GA ». Absente en WNBA. */
function venueOf(team: RawEspnTeam): string | undefined {
  const v = team.franchise?.venue;
  if (!v?.fullName) return undefined;
  const place = [v.address?.city, v.address?.state].filter(Boolean).join(", ");
  return place ? `${v.fullName} — ${place}` : v.fullName;
}

export async function getEspnTeamDetail(league: EspnLeague, id: string): Promise<TeamDetail> {
  const [info, roster, schedule, stats] = await Promise.all([
    fetchJson<{ team: RawEspnTeam }>(`${site(league)}/teams/${id}`, REVALIDATE.teams),
    fetchJsonSafe<RawEspnRoster>(`${site(league)}/teams/${id}/roster`, REVALIDATE.roster),
    teamSchedule(league, id),
    fetchJsonSafe<RawEspnTeamStats>(`${site(league)}/teams/${id}/statistics`, REVALIDATE.roster),
  ]);
  const r = roster ? normalizeRoster(roster) : { roster: [], coach: undefined };
  return {
    team: normalizeTeam(info.team, league),
    season: schedule.season,
    standingSummary: info.team.standingSummary,
    coach: r.coach,
    venue: venueOf(info.team),
    records: [],
    roster: r.roster,
    recent: schedule.recent.slice(0, 10),
    upcoming: schedule.upcoming.slice(0, 10),
    stats: stats ? normalizeTeamStats(stats) : [],
  };
}
