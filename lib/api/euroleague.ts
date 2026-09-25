import "server-only";
import { EuroleagueClient, type Club, type PlayerLeader } from "euroleague-api";
import { env, REVALIDATE } from "@/lib/env";
import { memoLive } from "@/lib/api/http";
import {
  EL_LEADER_STATS,
  LIVE_WINDOW_MS,
  normalizeClub,
  normalizeElGame,
  normalizeElLeaders,
  normalizeElPeople,
  normalizeElStandings,
  normalizeElPlays,
  type ElGame,
  type ElMeta,
  type ElPlay,
} from "@/lib/normalize/euroleague";
import { parisDayKey } from "@/lib/time";
import type {
  Game,
  GameDetail,
  GamesResponse,
  LeaderCategory,
  LeadersResponse,
  Standings,
  Team,
  TeamDetail,
  TeamStat,
  TeamStatGroup,
  TodayLeague,
} from "@/types";

/* ------------------------------- Client ------------------------------- */

/**
 * Le SDK accepte un `fetch` maison : on en profite pour garder la main sur le
 * cache, que le SDK ne gère pas lui-même. Deux politiques, donc deux clients :
 *
 * - **différé** : le cache de données de Next, avec la durée du sujet
 *   (effectifs, classements…) ;
 * - **direct** : aucun cache, pour que les scores ne traînent pas d'un cycle.
 *
 * Les clients sont mémorisés par politique : en créer un par appel relancerait
 * la validation de schéma à chaque fois.
 */
const clients = new Map<string, EuroleagueClient>();

function client(policy: number | "live"): EuroleagueClient {
  const key = String(policy);
  const existing = clients.get(key);
  if (existing) return existing;

  const custom: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      ...(policy === "live" ? { cache: "no-store" as const } : { next: { revalidate: policy } }),
    });

  const created = new EuroleagueClient({
    competition: "euroleague",
    fetch: custom,
    timeoutMs: env.upstreamTimeoutMs,
    retry: { retries: 2 },
  });
  clients.set(key, created);
  return created;
}

/* ------------------------------- Saisons ------------------------------- */

/** Saison courante : la saison N démarre en juillet de l'année N. */
export function currentSeason(now = new Date()): number {
  const [y, m] = parisDayKey(now).split("-").map(Number);
  return m >= 7 ? y : y - 1;
}

export const previousSeason = (season: number): number => season - 1;

export const seasonLabel = (season: number): string => `${season}-${String((season + 1) % 100).padStart(2, "0")}`;

/* -------------------------------- Appels ------------------------------- */

/**
 * Conversion unique, à la frontière : le SDK valide les réponses mais les
 * expose comme des enregistrements génériques. Au-delà de cette ligne, tout
 * l'applicatif manipule des types stricts.
 */
const asGames = (rows: unknown[]): ElGame[] => rows as ElGame[];
const asMeta = (row: unknown): ElMeta => row as ElMeta;

const schedule = async (season: number, revalidate: number): Promise<ElGame[]> =>
  asGames(await client(revalidate).schedule.getSeason({ season }));

/**
 * Calendrier sans péremption tolérée : le cache de données rendrait l'ancienne
 * version le temps de se rafraîchir, et les scores du jour arriveraient avec un
 * cycle de retard. La liste est lourde, on la mémorise donc quinze secondes
 * plutôt que de la redemander à chaque appel.
 */
const scheduleLive = (season: number): Promise<ElGame[]> =>
  memoLive(`el-schedule:${season}`, async () => asGames(await client("live").schedule.getSeason({ season })), 15_000);

/**
 * Flux en direct d'une rencontre.
 *
 * Il faut l'interroger match par match : la variante « toute la saison » ne
 * contient que les rencontres **terminées**, jamais celles en cours — un match
 * commencé depuis une heure y est absent et s'affichait donc « à venir », sans
 * score. Seule la version par match rend le direct.
 */
const liveMeta = (season: number, gameCode: number): Promise<ElMeta> =>
  memoLive(
    `el-meta:${season}:${gameCode}`,
    async () => asMeta(await client("live").gameMetadata.getGame({ season, gameCode })),
    5_000,
  );

/** Une rencontre mérite-t-elle qu'on lui cherche un score en direct ? */
function isLiveWindow(g: ElGame, now = Date.now()) {
  const start = new Date(g.utcDate).getTime();
  return !g.played && now >= start - 10 * 60_000 && now < start + LIVE_WINDOW_MS;
}

/** Complète les rencontres concernées avec le flux en direct. */
async function withLive(season: number, games: ElGame[]): Promise<Game[]> {
  return Promise.all(
    games.map(async (g) =>
      isLiveWindow(g) ? normalizeElGame(g, await liveMeta(season, g.gameCode).catch(() => null)) : normalizeElGame(g),
    ),
  );
}

const byDateAsc = (a: ElGame, b: ElGame) => a.utcDate.localeCompare(b.utcDate);
const byDateDesc = (a: ElGame, b: ElGame) => b.utcDate.localeCompare(a.utcDate);

/* ------------------------------- Équipes ------------------------------- */

export async function getElTeams(): Promise<Team[]> {
  const season = currentSeason();
  let clubs: Club[] = await client(REVALIDATE.teams).clubs.list({ season });
  if (clubs.length === 0) clubs = await client(REVALIDATE.teams).clubs.list({ season: previousSeason(season) });
  return clubs.map((c) => normalizeClub(c)).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

const clubMap = async (): Promise<Map<string, Team>> =>
  new Map((await getElTeams().catch(() => [] as Team[])).map((t) => [t.id, t]));

/* --------------------------- Matchs du jour ---------------------------- */

export async function getElToday(): Promise<TodayLeague> {
  const today = parisDayKey();
  const season = currentSeason();
  const games = await scheduleLive(season);
  const todays = games.filter((g) => parisDayKey(g.utcDate) === today).sort(byDateAsc);
  const next = games.filter((g) => !g.played && parisDayKey(g.utcDate) > today).sort(byDateAsc)[0];
  return {
    league: "euroleague",
    games: await withLive(season, todays),
    nextGame: next ? normalizeElGame(next) : undefined,
  };
}

/* ---------------------- Résultats et calendrier ------------------------ */

export async function getElGames(view: "results" | "upcoming"): Promise<GamesResponse> {
  const season = currentSeason();
  const games = await scheduleLive(season);
  if (view === "upcoming") {
    const list = games.filter((g) => !g.played).sort(byDateAsc).slice(0, 40);
    return {
      league: "euroleague",
      view,
      games: await withLive(season, list),
      note: list.length ? undefined : "Le calendrier de la prochaine saison n'est pas encore publié.",
    };
  }
  let played = games.filter((g) => g.played).sort(byDateDesc);
  let note: string | undefined;
  if (played.length === 0) {
    const prev = await schedule(previousSeason(season), REVALIDATE.standings);
    played = prev.filter((g) => g.played).sort(byDateDesc);
    note = `Inter-saison : derniers résultats de la saison ${seasonLabel(previousSeason(season))}.`;
  }
  return { league: "euroleague", view, games: played.slice(0, 40).map((g) => normalizeElGame(g)), note };
}

/* ------------------------------ Classement ----------------------------- */

function lastPlayedRound(games: ElGame[]): number {
  return games
    .filter((g) => g.played && (typeof g.phaseType === "string" ? g.phaseType : "RS") === "RS")
    .reduce((m, g) => Math.max(m, g.round ?? 0), 0);
}

export async function getElStandings(): Promise<Standings> {
  let season = currentSeason();
  let round = lastPlayedRound(await schedule(season, REVALIDATE.standings));
  let isPreviousSeason = false;
  if (round === 0) {
    season = previousSeason(season);
    round = lastPlayedRound(await schedule(season, REVALIDATE.standings));
    isPreviousSeason = true;
  }
  const raw = await client(REVALIDATE.standings).standings.getRound({ season, round: Math.max(round, 1) });
  const rows = normalizeElStandings(raw);
  const played = rows.reduce((s, r) => s + r.played, 0);
  const points = raw.reduce((s, r) => s + Number(r.pointsFor ?? 0), 0);
  return {
    league: "euroleague",
    season: seasonLabel(season),
    isPreviousSeason,
    groups: [{ name: "Saison régulière", rows }],
    totals: { games: Math.round(played / 2), points },
  };
}

/* -------------------------------- Leaders ------------------------------ */

const CATEGORIES = Object.keys(EL_LEADER_STATS) as LeaderCategory[];

async function leadersOf(season: number): Promise<Record<LeaderCategory, PlayerLeader[]>> {
  const c = client(REVALIDATE.leaders);
  const listes = await Promise.all(
    CATEGORIES.map((cat) =>
      c.players
        .getLeaders({ season, statistic: EL_LEADER_STATS[cat], mode: "PerGame" })
        .catch(() => [] as PlayerLeader[]),
    ),
  );
  return Object.fromEntries(CATEGORIES.map((cat, i) => [cat, listes[i]])) as Record<LeaderCategory, PlayerLeader[]>;
}

export async function getElLeaders(): Promise<LeadersResponse> {
  let season = currentSeason();
  let raw = await leadersOf(season);
  if (raw.points.length === 0) {
    season = previousSeason(season);
    raw = await leadersOf(season);
  }
  return { league: "euroleague", season: seasonLabel(season), leaders: normalizeElLeaders(raw, await clubMap()) };
}

/* -------------------------------- Équipe ------------------------------- */

const teamGames = (games: ElGame[], code: string) =>
  games.filter((g) => g.local.club.code === code || g.road.club.code === code);

async function clubSchedule(code: string) {
  const season = currentSeason();
  const games = teamGames(await scheduleLive(season), code);
  const upcoming = games.filter((g) => !g.played).sort(byDateAsc);
  let recent = games.filter((g) => g.played).sort(byDateDesc);
  let recentSeason = season;
  if (recent.length === 0) {
    recentSeason = previousSeason(season);
    recent = teamGames(await schedule(recentSeason, REVALIDATE.standings), code)
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
function computeStats(code: string, games: ElGame[]): { records: TeamStat[]; stats: TeamStatGroup[] } {
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
    const us = Number((home ? g.local.score : g.road.score) ?? 0);
    const them = Number((home ? g.road.score : g.local.score) ?? 0);
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
  const season = currentSeason();
  const c = client(REVALIDATE.roster);
  const [teams, sched, peopleNow] = await Promise.all([
    getElTeams(),
    clubSchedule(code),
    c.clubs.getRoster({ season, clubCode: code }).catch(() => []),
  ]);
  let people = peopleNow;
  if (!people.some((p) => p.type === "J")) {
    people = await c.clubs.getRoster({ season: previousSeason(season), clubCode: code }).catch(() => []);
  }
  const { roster, coach } = normalizeElPeople(people);

  const dansUnMatch = [sched.recent[0], sched.upcoming[0]]
    .filter(Boolean)
    .map((g) => (g!.local.club.code === code ? g!.local.club : g!.road.club))[0];
  const team = teams.find((t) => t.id === code) ?? (dansUnMatch ? normalizeClub(dansUnMatch) : null);
  if (!team) throw new Error("unknown club");

  const computed = computeStats(code, sched.recent);
  return {
    team,
    season: seasonLabel(sched.recentSeason),
    coach,
    records: computed.records,
    roster,
    recent: sched.recent.slice(0, 10).map((g) => normalizeElGame(g)),
    upcoming: await withLive(season, sched.upcoming.slice(0, 10)),
    stats: computed.stats,
  };
}

/* ------------------------------- Match -------------------------------- */

/** « E2026_6 » → saison 2026, match n° 6. */
export function parseElGameId(id: string): { season: number; gameCode: number } | null {
  const m = id.match(/^[A-Z](\d{4})_(\d{1,4})$/);
  return m ? { season: Number(m[1]), gameCode: Number(m[2]) } : null;
}

/**
 * En-tête et play-by-play d'un match.
 *
 * Le déroulé est interrogé sans cache et mémorisé cinq secondes : il sert
 * aussi bien un match en cours qu'un match terminé. L'en-tête vient du
 * calendrier, complété par le flux en direct comme partout ailleurs.
 */
export async function getElGameDetail(id: string): Promise<GameDetail> {
  const ref = parseElGameId(id);
  if (!ref) throw new Error("identifiant de match invalide");
  const [games, plays] = await Promise.all([
    ref.season === currentSeason() ? scheduleLive(ref.season) : schedule(ref.season, REVALIDATE.standings),
    memoLive(
      `el-pbp:${ref.season}:${ref.gameCode}`,
      async () => (await client("live").playByPlay.getGame(ref)) as unknown as ElPlay[],
      5_000,
    ),
  ]);
  const raw = games.find((g) => g.gameCode === ref.gameCode);
  if (!raw) throw new Error("match introuvable");
  const [game] = await withLive(ref.season, [raw]);
  return { game, plays: normalizeElPlays(plays) };
}
