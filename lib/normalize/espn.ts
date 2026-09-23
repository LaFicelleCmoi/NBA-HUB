import type {
  Game,
  GameStatus,
  GameTeam,
  Leader,
  LeaderCategory,
  LeaderEntry,
  LeagueId,
  Logo,
  NewsItem,
  Player,
  StandingGroup,
  StandingRow,
  Team,
  TeamStat,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Formes brutes (partielles) des réponses ESPN                        */
/* ------------------------------------------------------------------ */

interface RawLogo {
  href: string;
  rel?: string[];
}

export interface RawEspnTeam {
  id: string;
  abbreviation?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  location?: string;
  color?: string;
  logo?: string;
  logos?: RawLogo[];
  isActive?: boolean;
  standingSummary?: string;
}

interface RawStatus {
  clock?: number;
  displayClock?: string;
  period?: number;
  type?: { name?: string; state?: string; completed?: boolean; detail?: string; shortDetail?: string };
}

interface RawCompetitor {
  homeAway: "home" | "away";
  winner?: boolean;
  score?: string | { value?: number; displayValue?: string };
  team: RawEspnTeam;
  linescores?: { value?: number }[];
  records?: { type?: string; summary?: string }[];
  record?: { type?: string; displayValue?: string }[];
}

export interface RawEspnEvent {
  id: string;
  date: string;
  status?: RawStatus;
  seasonType?: { name?: string };
  season?: { slug?: string };
  competitions?: {
    status?: RawStatus;
    venue?: { fullName?: string };
    notes?: { headline?: string }[];
    competitors: RawCompetitor[];
  }[];
}

export interface RawStandingsNode {
  name?: string;
  abbreviation?: string;
  season?: { year?: number; displayName?: string };
  children?: RawStandingsNode[];
  standings?: {
    seasonDisplayName?: string;
    entries?: { team: RawEspnTeam; stats: { name: string; value?: number; displayValue?: string }[] }[];
  };
}

/* ------------------------------------------------------------------ */

const CONFERENCE_FR: Record<string, string> = {
  "Eastern Conference": "Est",
  "Western Conference": "Ouest",
  East: "Est",
  West: "Ouest",
};

export function espnLogo(team: RawEspnTeam, league: LeagueId): Logo {
  const def =
    team.logos?.find((l) => l.rel?.includes("default"))?.href ??
    team.logo ??
    (team.abbreviation
      ? `https://a.espncdn.com/i/teamlogos/${league}/500/${team.abbreviation.toLowerCase()}.png`
      : "");
  const light = def.replace("/500/scoreboard/", "/500/").replace("/500-dark/", "/500/");
  return { light, dark: light.replace("/500/", "/500-dark/") };
}

export function normalizeTeam(raw: RawEspnTeam, league: LeagueId): Team {
  return {
    id: String(raw.id),
    league,
    name: raw.displayName ?? raw.name ?? "",
    shortName: raw.shortDisplayName ?? raw.name ?? raw.displayName ?? "",
    abbreviation: raw.abbreviation ?? "",
    logo: espnLogo(raw, league),
    color: raw.color ? `#${raw.color}` : undefined,
    location: raw.location,
  };
}

function scoreOf(s: RawCompetitor["score"]): number | null {
  if (s == null) return null;
  const n = typeof s === "string" ? Number(s) : Number(s.value ?? s.displayValue);
  return Number.isFinite(n) ? n : null;
}

function statusOf(raw?: RawStatus): GameStatus {
  const name = raw?.type?.name ?? "";
  if (/POSTPONED|CANCELED|SUSPENDED|DELAYED/.test(name)) return "postponed";
  switch (raw?.type?.state) {
    case "in":
      return "live";
    case "post":
      return "final";
    default:
      return "scheduled";
  }
}

function frenchDetail(status: GameStatus, raw?: RawStatus): string {
  const period = raw?.period ?? 0;
  switch (status) {
    case "final":
      return period > 4 ? (period > 5 ? `Terminé (${period - 4} prol.)` : "Terminé (prol.)") : "Terminé";
    case "live": {
      const detail = raw?.type?.detail ?? "";
      if (/half/i.test(detail)) return "Mi-temps";
      if (/end/i.test(detail)) return `Fin ${period > 4 ? "prol." : `Q${period}`}`;
      const label = period > 4 ? `Prol.${period > 5 ? ` ${period - 4}` : ""}` : `Q${period}`;
      return raw?.displayClock ? `${label} · ${raw.displayClock}` : label;
    }
    case "postponed":
      return "Reporté";
    default:
      return "À venir";
  }
}

function sideOf(c: RawCompetitor | undefined, league: LeagueId, status: GameStatus): GameTeam {
  const team = c ? normalizeTeam(c.team, league) : normalizeTeam({ id: "0", displayName: "À déterminer" }, league);
  const record =
    c?.records?.find((r) => r.type === "total")?.summary ?? c?.record?.find((r) => r.type === "total")?.displayValue;
  return {
    team,
    score: status === "scheduled" ? null : scoreOf(c?.score),
    periods: (c?.linescores ?? []).map((l) => Number(l.value ?? 0)),
    winner: Boolean(c?.winner),
    record,
    isHome: c?.homeAway === "home",
  };
}

export function normalizeEvent(ev: RawEspnEvent, league: LeagueId): Game {
  const comp = ev.competitions?.[0];
  const rawStatus = comp?.status ?? ev.status;
  const status = statusOf(rawStatus);
  const home = comp?.competitors.find((c) => c.homeAway === "home");
  const away = comp?.competitors.find((c) => c.homeAway === "away");
  const note = comp?.notes?.[0]?.headline;
  return {
    id: String(ev.id),
    league,
    date: ev.date,
    status,
    statusDetail: frenchDetail(status, rawStatus),
    period: rawStatus?.period,
    clock: rawStatus?.displayClock,
    home: sideOf(home, league, status),
    away: sideOf(away, league, status),
    venue: comp?.venue?.fullName,
    phase: note ?? (ev.seasonType?.name === "Postseason" ? "Playoffs" : undefined),
  };
}

/* ------------------------------ Classements ------------------------------ */

function statMap(stats: { name: string; value?: number; displayValue?: string }[]) {
  const m = new Map<string, { value?: number; displayValue?: string }>();
  for (const s of stats) m.set(s.name, s);
  return m;
}

export function normalizeStandings(root: RawStandingsNode, league: LeagueId) {
  const groups: StandingGroup[] = [];
  let points = 0;
  let played = 0;
  for (const child of root.children ?? []) {
    const entries = child.standings?.entries ?? [];
    const rows: StandingRow[] = entries.map((e) => {
      const s = statMap(e.stats);
      const wins = Number(s.get("wins")?.value ?? 0);
      const losses = Number(s.get("losses")?.value ?? 0);
      points += Number(s.get("pointsFor")?.value ?? 0);
      played += wins + losses;
      return {
        team: { ...normalizeTeam(e.team, league), conference: CONFERENCE_FR[child.name ?? ""] },
        rank: 0,
        played: wins + losses,
        wins,
        losses,
        winPct: Number(s.get("winPercent")?.value ?? (wins + losses ? wins / (wins + losses) : 0)),
        diff: Number(s.get("pointDifferential")?.value ?? 0),
        streak: s.get("streak")?.displayValue?.replace(/^W/, "V").replace(/^L/, "D"),
        seed: Number(s.get("playoffSeed")?.value ?? 0),
      };
    });
    rows.sort((a, b) => (a.seed && b.seed ? a.seed - b.seed : b.winPct - a.winPct || b.diff - a.diff));
    rows.forEach((r, i) => {
      r.rank = i + 1;
    });
    groups.push({ name: CONFERENCE_FR[child.name ?? ""] ?? child.name ?? "", rows });
  }

  // WNBA : les zones de playoffs se calculent sur la ligue entière.
  if (league === "wnba") {
    const all = groups.flatMap((g) => g.rows);
    // ESPN renvoie souvent un « playoffSeed » par conférence (1..n dans chacune) :
    // il se répète d'une conférence à l'autre et ne peut pas servir de rang de ligue.
    // On ne le garde que s'il forme bien une numérotation unique sur toute la ligue.
    const hasSeeds = all.every((r) => r.seed > 0) && new Set(all.map((r) => r.seed)).size === all.length;
    if (!hasSeeds) {
      [...all]
        .sort((a, b) => b.winPct - a.winPct || b.diff - a.diff)
        .forEach((r, i) => {
          r.seed = i + 1;
        });
    }
  } else {
    for (const g of groups) for (const r of g.rows) r.seed = r.rank;
  }

  const season =
    root.children?.[0]?.standings?.seasonDisplayName ?? root.season?.displayName ?? String(root.season?.year ?? "");
  return { groups, season, totals: { games: Math.round(played / 2), points } };
}

/* -------------------------------- Leaders -------------------------------- */

const LEADER_MAP: Record<string, { category: LeaderCategory; label: string }> = {
  pointsPerGame: { category: "points", label: "Points" },
  reboundsPerGame: { category: "rebounds", label: "Rebonds" },
  assistsPerGame: { category: "assists", label: "Passes décisives" },
  stealsPerGame: { category: "steals", label: "Interceptions" },
  blocksPerGame: { category: "blocks", label: "Contres" },
};

export interface RawEspnLeaders {
  requestedSeason?: { displayName?: string };
  leaders?: {
    categories?: {
      name: string;
      leaders?: {
        value: number;
        displayValue: string;
        athlete: { id: string; displayName: string; headshot?: { href?: string } };
        team?: RawEspnTeam;
      }[];
    }[];
  };
}

export function normalizeLeaders(raw: RawEspnLeaders, league: LeagueId): Leader[] {
  const order: LeaderCategory[] = ["points", "rebounds", "assists", "steals", "blocks"];
  const out: Leader[] = [];
  for (const cat of raw.leaders?.categories ?? []) {
    const def = LEADER_MAP[cat.name];
    if (!def) continue;
    const entries: LeaderEntry[] = (cat.leaders ?? []).slice(0, 10).map((l, i) => ({
      rank: i + 1,
      playerId: l.athlete.id,
      name: l.athlete.displayName,
      headshot: l.athlete.headshot?.href,
      team: l.team ? normalizeTeam(l.team, league) : undefined,
      value: l.value,
      displayValue: l.displayValue,
    }));
    out.push({ ...def, entries });
  }
  return out.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
}

/* --------------------------------- News ---------------------------------- */

export interface RawEspnNews {
  articles?: {
    id?: number | string;
    headline?: string;
    description?: string;
    published?: string;
    images?: { url?: string }[];
    links?: { web?: { href?: string } };
  }[];
}

export function normalizeNews(raw: RawEspnNews): NewsItem[] {
  return (raw.articles ?? [])
    .filter((a) => a.headline && a.links?.web?.href?.startsWith("https://"))
    .map((a, i) => ({
      id: String(a.id ?? i),
      title: a.headline!,
      description: a.description,
      published: a.published ? new Date(a.published).toISOString() : "",
      image: a.images?.[0]?.url,
      url: a.links!.web!.href!,
      source: "ESPN",
      lang: "en" as const,
    }));
}

/* ------------------------------ Effectif ------------------------------- */

export interface RawEspnRoster {
  athletes?: {
    id: string;
    displayName: string;
    jersey?: string;
    position?: { abbreviation?: string; displayName?: string };
    displayHeight?: string;
    displayWeight?: string;
    height?: number;
    weight?: number;
    age?: number;
    headshot?: { href?: string };
    birthPlace?: { country?: string };
  }[];
  coach?: { firstName?: string; lastName?: string }[];
}

export function normalizeRoster(raw: RawEspnRoster): { roster: Player[]; coach?: string } {
  const roster: Player[] = (raw.athletes ?? []).map((a) => ({
    id: a.id,
    name: a.displayName,
    jersey: a.jersey,
    position: a.position?.abbreviation,
    height: a.height ? `${Math.round(a.height * 2.54)} cm` : a.displayHeight,
    weight: a.weight ? `${Math.round(a.weight * 0.4536)} kg` : a.displayWeight,
    age: a.age,
    country: a.birthPlace?.country,
    headshot: a.headshot?.href,
  }));
  roster.sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));
  const c = raw.coach?.[0];
  return { roster, coach: c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : undefined };
}

/* --------------------------- Statistiques équipe -------------------------- */

export interface RawEspnTeamStats {
  results?: {
    stats?: { categories?: { stats?: { name: string; displayValue?: string }[] }[] };
  };
}

const TEAM_STATS: [string, string][] = [
  ["avgPoints", "Points / match"],
  ["avgRebounds", "Rebonds / match"],
  ["avgAssists", "Passes / match"],
  ["avgSteals", "Interceptions / match"],
  ["avgBlocks", "Contres / match"],
  ["avgTurnovers", "Balles perdues / match"],
  ["fieldGoalPct", "% aux tirs"],
  ["threePointFieldGoalPct", "% à 3 points"],
  ["freeThrowPct", "% aux lancers francs"],
];

export function normalizeTeamStats(raw: RawEspnTeamStats): TeamStat[] {
  const all = new Map<string, string>();
  for (const c of raw.results?.stats?.categories ?? [])
    for (const s of c.stats ?? []) if (!all.has(s.name) && s.displayValue) all.set(s.name, s.displayValue);
  return TEAM_STATS.filter(([k]) => all.has(k)).map(([k, label]) => ({
    label,
    value: label.startsWith("%") ? `${all.get(k)} %` : all.get(k)!,
  }));
}
