import "server-only";
import { env, REVALIDATE } from "@/lib/env";
import { fetchJson, fetchJsonSafe } from "@/lib/api/http";
import {
  LIVE_WINDOW_MS,
  normalizeClub,
  normalizeElGame,
  normalizeElLeaders,
  normalizeElPeople,
  normalizeElStandings,
  type RawElClub,
  type RawElGame,
  type RawElHeader,
  type RawElLeaders,
  type RawElPerson,
  type RawElStandingRow,
} from "@/lib/normalize/euroleague";
import { parisDayKey } from "@/lib/time";
import type {
  Game,
  GamesResponse,
  LeadersResponse,
  Standings,
  Team,
  TeamDetail,
  TeamStat,
  TeamStatGroup,
  TodayLeague,
} from "@/types";

const comp = () => `${env.euroleagueApi}/v2/competitions/${env.euroleagueCompetition}`;

/** Code de saison courant : la saison N démarre en juillet de l'année N. */
export function currentSeasonCode(now = new Date()): string {
  const [y, m] = parisDayKey(now).split("-").map(Number);
  return `${env.euroleagueCompetition}${m >= 7 ? y : y - 1}`;
}

export function previousSeasonCode(code: string): string {
  return `${env.euroleagueCompetition}${Number(code.slice(env.euroleagueCompetition.length)) - 1}`;
}

export function seasonLabel(code: string): string {
  const y = Number(code.slice(env.euroleagueCompetition.length));
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

async function rawGames(season: string, revalidate: number): Promise<RawElGame[]> {
  const res = await fetchJson<{ data?: RawElGame[] }>(`${comp()}/seasons/${season}/games`, revalidate);
  return res.data ?? [];
}

async function rawClubs(season: string): Promise<RawElClub[]> {
  const res = await fetchJson<{ data?: RawElClub[] }>(`${comp()}/seasons/${season}/clubs`, REVALIDATE.teams);
  return res.data ?? [];
}

function isLiveWindow(g: RawElGame, now = Date.now()) {
  const start = new Date(g.utcDate).getTime();
  return !g.played && now >= start - 10 * 60_000 && now < start + LIVE_WINDOW_MS;
}

async function withLive(games: RawElGame[]): Promise<Game[]> {
  return Promise.all(
    games.map(async (g) => {
      if (!isLiveWindow(g)) return normalizeElGame(g);
      const header = await fetchJsonSafe<RawElHeader>(
        `${env.euroleagueLiveApi}/Header?gamecode=${g.gameCode}&seasoncode=${g.season.code}`,
        REVALIDATE.live,
      );
      return normalizeElGame(g, header);
    }),
  );
}

const byDateAsc = (a: { utcDate: string }, b: { utcDate: string }) => a.utcDate.localeCompare(b.utcDate);
const byDateDesc = (a: { utcDate: string }, b: { utcDate: string }) => b.utcDate.localeCompare(a.utcDate);

/* ---------------------------------- Équipes --------------------------------- */

export async function getElTeams(): Promise<Team[]> {
  const season = currentSeasonCode();
  let clubs = await rawClubs(season);
  if (clubs.length === 0) clubs = await rawClubs(previousSeasonCode(season));
  return clubs.map(normalizeClub).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

async function clubMap(): Promise<Map<string, Team>> {
  const teams = await getElTeams().catch(() => [] as Team[]);
  return new Map(teams.map((t) => [t.id, t]));
}

/* ------------------------------ Matchs du jour ------------------------------ */

export async function getElToday(): Promise<TodayLeague> {
  const today = parisDayKey();
  const games = await rawGames(currentSeasonCode(), REVALIDATE.live);
  const todays = games.filter((g) => parisDayKey(g.utcDate) === today).sort(byDateAsc);
  const next = games
    .filter((g) => !g.played && parisDayKey(g.utcDate) > today)
    .sort(byDateAsc)[0];
  return {
    league: "euroleague",
    games: await withLive(todays),
    nextGame: next ? normalizeElGame(next) : undefined,
  };
}

/* ------------------------- Résultats et calendrier -------------------------- */

export async function getElGames(view: "results" | "upcoming"): Promise<GamesResponse> {
  const season = currentSeasonCode();
  const games = await rawGames(season, REVALIDATE.live);
  if (view === "upcoming") {
    const list = games.filter((g) => !g.played).sort(byDateAsc).slice(0, 40);
    return {
      league: "euroleague",
      view,
      games: await withLive(list),
      note: list.length ? undefined : "Le calendrier de la prochaine saison n'est pas encore publié.",
    };
  }
  let played = games.filter((g) => g.played).sort(byDateDesc);
  let note: string | undefined;
  if (played.length === 0) {
    const prev = await rawGames(previousSeasonCode(season), REVALIDATE.standings);
    played = prev.filter((g) => g.played).sort(byDateDesc);
    note = `Inter-saison : derniers résultats de la saison ${seasonLabel(previousSeasonCode(season))}.`;
  }
  return { league: "euroleague", view, games: played.slice(0, 40).map((g) => normalizeElGame(g)), note };
}

/* -------------------------------- Classement -------------------------------- */

function lastPlayedRound(games: RawElGame[]): number {
  return games
    .filter((g) => g.played && (g.phaseType?.code ?? "RS") === "RS")
    .reduce((m, g) => Math.max(m, g.round ?? 0), 0);
}

export async function getElStandings(): Promise<Standings> {
  let season = currentSeasonCode();
  let round = lastPlayedRound(await rawGames(season, REVALIDATE.standings));
  let isPreviousSeason = false;
  if (round === 0) {
    season = previousSeasonCode(season);
    round = lastPlayedRound(await rawGames(season, REVALIDATE.standings));
    isPreviousSeason = true;
  }
  const res = await fetchJson<{ teams?: RawElStandingRow[] }>(
    `${env.euroleagueApi}/v3/competitions/${env.euroleagueCompetition}/seasons/${season}/rounds/${Math.max(round, 1)}/basicstandings`,
    REVALIDATE.standings,
  );
  const raw = res.teams ?? [];
  const rows = normalizeElStandings(raw);
  const played = rows.reduce((s, r) => s + r.played, 0);
  const points = raw.reduce((s, r) => s + (r.pointsFor ?? 0), 0);
  return {
    league: "euroleague",
    season: seasonLabel(season),
    isPreviousSeason,
    groups: [{ name: "Saison régulière", rows }],
    totals: { games: Math.round(played / 2), points },
  };
}

/* ---------------------------------- Leaders --------------------------------- */

async function rawLeaders(season: string) {
  return fetchJson<RawElLeaders>(
    `${env.euroleagueApi}/v3/competitions/${env.euroleagueCompetition}/statistics/players/leaders?seasonMode=Single&seasonCode=${season}&statisticMode=PerGame`,
    REVALIDATE.leaders,
  );
}

export async function getElLeaders(): Promise<LeadersResponse> {
  let season = currentSeasonCode();
  let raw = await rawLeaders(season);
  if (!raw.points?.length) {
    season = previousSeasonCode(season);
    raw = await rawLeaders(season);
  }
  return { league: "euroleague", season: seasonLabel(season), leaders: normalizeElLeaders(raw, await clubMap()) };
}

/* ---------------------------------- Équipe ---------------------------------- */

function teamGames(games: RawElGame[], code: string) {
  return games.filter((g) => g.local.club.code === code || g.road.club.code === code);
}

async function clubSchedule(code: string) {
  const season = currentSeasonCode();
  const games = teamGames(await rawGames(season, REVALIDATE.live), code);
  const upcoming = games.filter((g) => !g.played).sort(byDateAsc);
  let recent = games.filter((g) => g.played).sort(byDateDesc);
  let recentSeason = season;
  if (recent.length === 0) {
    recentSeason = previousSeasonCode(season);
    recent = teamGames(await rawGames(recentSeason, REVALIDATE.standings), code)
      .filter((g) => g.played)
      .sort(byDateDesc);
  }
  return { season, recentSeason, upcoming, recent };
}

export async function getElRecent(code: string): Promise<Game[]> {
  const { recent } = await clubSchedule(code);
  return recent.slice(0, 5).map((g) => normalizeElGame(g));
}

/** Forme et prochaine affiche seules : inutile de charger l'effectif. */
export async function getElTeamForm(code: string) {
  const { recent, upcoming } = await clubSchedule(code);
  return {
    recent: recent.slice(0, 5).map((g) => normalizeElGame(g)),
    next: upcoming[0] ? normalizeElGame(upcoming[0]) : undefined,
  };
}

/**
 * L'API EuroLeague n'expose pas de statistiques d'équipe : on les recalcule
 * à partir des matchs joués. Les bilans (général, domicile, extérieur) sont
 * renvoyés à part, pour être affichés comme les bilans ESPN.
 */
function computeStats(code: string, games: RawElGame[]): { records: TeamStat[]; stats: TeamStatGroup[] } {
  if (!games.length) return { records: [], stats: [] };
  let w = 0,
    pf = 0,
    pa = 0,
    hw = 0,
    hl = 0,
    aw = 0,
    al = 0;
  for (const g of games) {
    const home = g.local.club.code === code;
    const us = home ? g.local.score : g.road.score;
    const them = home ? g.road.score : g.local.score;
    pf += us;
    pa += them;
    const won = us > them;
    if (won) w++;
    if (home) {
      if (won) hw++;
      else hl++;
    } else if (won) aw++;
    else al++;
  }
  const n = games.length;
  const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;
  return {
    records: [
      { label: "Bilan général", value: `${w}-${n - w}` },
      { label: "À domicile", value: `${hw}-${hl}` },
      { label: "À l'extérieur", value: `${aw}-${al}` },
      { label: "% de victoires", value: (w / n).toFixed(3).replace(/^0/, "") },
      { label: "Points marqués / match", value: (pf / n).toFixed(1) },
      { label: "Points encaissés / match", value: (pa / n).toFixed(1) },
      { label: "Différence / match", value: signed((pf - pa) / n) },
    ],
    stats: [
      {
        label: "Totaux de la saison",
        stats: [
          { label: "Matchs joués", value: String(n) },
          { label: "Points marqués", value: String(pf) },
          { label: "Points encaissés", value: String(pa) },
          { label: "Différence totale", value: signed(pf - pa).replace(".0", "") },
        ],
      },
    ],
  };
}

export async function getElTeamDetail(code: string): Promise<TeamDetail> {
  const season = currentSeasonCode();
  const [teams, schedule, peopleNow] = await Promise.all([
    getElTeams(),
    clubSchedule(code),
    fetchJsonSafe<RawElPerson[]>(`${comp()}/seasons/${season}/clubs/${code}/people`, REVALIDATE.roster),
  ]);
  let people = peopleNow ?? [];
  if (!people.some((p) => p.type === "J")) {
    people =
      (await fetchJsonSafe<RawElPerson[]>(
        `${comp()}/seasons/${previousSeasonCode(season)}/clubs/${code}/people`,
        REVALIDATE.roster,
      )) ?? [];
  }
  const { roster, coach } = normalizeElPeople(people);
  const team =
    teams.find((t) => t.id === code) ??
    (schedule.recent[0] || schedule.upcoming[0]
      ? normalizeClub(
          [schedule.recent[0], schedule.upcoming[0]]
            .filter(Boolean)
            .map((g) => (g!.local.club.code === code ? g!.local.club : g!.road.club))[0],
        )
      : null);
  if (!team) throw new Error("unknown club");

  const computed = computeStats(code, schedule.recent);
  return {
    team,
    season: seasonLabel(schedule.recentSeason),
    coach,
    records: computed.records,
    roster,
    recent: schedule.recent.slice(0, 10).map((g) => normalizeElGame(g)),
    upcoming: await withLive(schedule.upcoming.slice(0, 10)),
    stats: computed.stats,
  };
}
