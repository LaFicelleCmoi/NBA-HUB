import type { Game, GameStatus, GameTeam, Leader, LeaderCategory, Player, StandingRow, Team } from "@/types";

/* ------------------------------------------------------------------ */
/* Formes brutes (partielles) de l'API api-live.euroleague.net         */
/* ------------------------------------------------------------------ */

export interface RawElClub {
  code: string;
  name: string;
  abbreviatedName?: string;
  editorialName?: string;
  tvCode?: string;
  images?: { crest?: string };
  country?: { name?: string };
  city?: string;
}

interface RawElSide {
  club: RawElClub;
  score: number;
  partials?: {
    partials1?: number;
    partials2?: number;
    partials3?: number;
    partials4?: number;
    extraPeriods?: Record<string, number>;
  };
}

export interface RawElGame {
  identifier: string;
  gameCode: number;
  season: { code: string };
  phaseType?: { code?: string; name?: string };
  round?: number;
  roundName?: string;
  played: boolean;
  utcDate: string;
  gameStatus?: string;
  local: RawElSide;
  road: RawElSide;
  venue?: { name?: string };
}

export interface RawElHeader {
  Live?: boolean;
  ScoreA?: string;
  ScoreB?: string;
  Quarter?: string;
  RemainingPartialTime?: string;
  ScoreQuarter1A?: number;
  ScoreQuarter2A?: number;
  ScoreQuarter3A?: number;
  ScoreQuarter4A?: number;
  ScoreExtraTimeA?: number;
  ScoreQuarter1B?: number;
  ScoreQuarter2B?: number;
  ScoreQuarter3B?: number;
  ScoreQuarter4B?: number;
  ScoreExtraTimeB?: number;
}

export interface RawElStandingRow {
  position: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  club: RawElClub;
  winPercentage?: string;
  pointsDifference?: string;
  pointsFor?: number;
  last5Form?: string[];
}

interface RawElLeader {
  details: { code: string; name: string; imageUrl?: string; team?: { code: string; name: string; imageUrl?: string } };
  rank: number;
  gamesPlayed?: number;
  average: number;
}

export type RawElLeaders = Partial<Record<"points" | "rebounds" | "assists" | "steals" | "blocks", RawElLeader[]>>;

export interface RawElPerson {
  person: {
    code: string;
    name: string;
    country?: { name?: string };
    height?: number;
    weight?: number;
    birthDate?: string;
    images?: { headshot?: string };
  };
  type: string;
  active?: boolean;
  dorsal?: string;
  positionName?: string | null;
  images?: { headshot?: string; action?: string };
}

/* ------------------------------------------------------------------ */

/** « JONES, DAMIAN » → « Damian Jones » */
export function prettyName(raw: string): string {
  const [last, first] = raw.split(",").map((s) => s.trim());
  const cap = (s: string) =>
    s
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return first ? `${cap(first)} ${cap(last)}` : cap(last);
}

export function normalizeClub(c: RawElClub): Team {
  const crest = c.images?.crest ?? "";
  return {
    id: c.code,
    league: "euroleague",
    name: c.name,
    shortName: c.editorialName ?? c.abbreviatedName ?? c.name,
    abbreviation: c.tvCode ?? c.code,
    logo: { light: crest, dark: crest },
    location: [c.city ? prettyName(c.city) : undefined, c.country?.name].filter(Boolean).join(", ") || undefined,
  };
}

function periodsOf(side: RawElSide): number[] {
  const p = side.partials ?? {};
  const base = [p.partials1, p.partials2, p.partials3, p.partials4].map((v) => Number(v ?? 0));
  const extra = Object.keys(p.extraPeriods ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => Number(p.extraPeriods![k] ?? 0));
  return [...base, ...extra];
}

/** Scores par période à partir des cumuls du flux live. */
function livePeriods(h: RawElHeader, s: "A" | "B"): number[] {
  const current = Number.parseInt(h.Quarter ?? "", 10) || 4;
  const out: number[] = [];
  let prev = 0;
  for (let q = 1; q <= Math.min(current, 4); q++) {
    const cum = Number(h[`ScoreQuarter${q}${s}` as keyof RawElHeader] ?? 0);
    out.push(Math.max(0, cum - prev));
    prev = Math.max(prev, cum);
  }
  const ot = Number(h[`ScoreExtraTime${s}` as keyof RawElHeader] ?? 0);
  if (current > 4 && ot > 0) out.push(Math.max(0, ot - prev));
  return out;
}

export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

export function normalizeElGame(g: RawElGame, header?: RawElHeader | null): Game {
  const start = new Date(g.utcDate).getTime();
  const now = Date.now();
  let status: GameStatus = "scheduled";
  if (/postpon|cancel/i.test(g.gameStatus ?? "")) status = "postponed";
  else if (g.played) status = "final";
  else if (header?.Live || (now >= start && now < start + LIVE_WINDOW_MS && header)) status = "live";

  const hasPartials = status !== "scheduled";
  const homePeriods = status === "live" && header ? livePeriods(header, "A") : hasPartials ? periodsOf(g.local) : [];
  const awayPeriods = status === "live" && header ? livePeriods(header, "B") : hasPartials ? periodsOf(g.road) : [];
  const homeScore = status === "live" && header ? Number(header.ScoreA ?? 0) : g.local.score;
  const awayScore = status === "live" && header ? Number(header.ScoreB ?? 0) : g.road.score;

  const side = (s: RawElSide, score: number, periods: number[], other: number, isHome: boolean): GameTeam => ({
    team: normalizeClub(s.club),
    score: status === "scheduled" || status === "postponed" ? null : score,
    periods,
    winner: status === "final" && score > other,
    isHome,
  });

  const otCount = Math.max(homePeriods.length, awayPeriods.length) - 4;
  let statusDetail = "À venir";
  if (status === "final") statusDetail = otCount > 0 ? (otCount > 1 ? `Terminé (${otCount} prol.)` : "Terminé (prol.)") : "Terminé";
  else if (status === "postponed") statusDetail = "Reporté";
  else if (status === "live") {
    const q = header?.Quarter?.trim();
    statusDetail = [q ? `Q${q}` : "En cours", header?.RemainingPartialTime?.trim()].filter(Boolean).join(" · ");
  }

  return {
    id: g.identifier,
    league: "euroleague",
    date: g.utcDate,
    status,
    statusDetail,
    home: side(g.local, homeScore, homePeriods, awayScore, true),
    away: side(g.road, awayScore, awayPeriods, homeScore, false),
    venue: g.venue?.name ? prettyName(g.venue.name) : undefined,
    phase: g.phaseType?.code && g.phaseType.code !== "RS" ? g.phaseType.name : undefined,
    round: g.roundName?.replace("Round", "Journée"),
  };
}

export function normalizeElStandings(rows: RawElStandingRow[]): StandingRow[] {
  return rows.map((r) => ({
    team: normalizeClub(r.club),
    rank: r.position,
    seed: r.position,
    played: r.gamesPlayed,
    wins: r.gamesWon,
    losses: r.gamesLost,
    winPct: r.gamesPlayed ? r.gamesWon / r.gamesPlayed : 0,
    diff: Number((r.pointsDifference ?? "0").replace("+", "")) || 0,
    streak: r.last5Form?.map((f) => (f === "W" ? "V" : f === "L" ? "D" : f)).join(""),
  }));
}

const EL_LEADER_LABELS: Record<LeaderCategory, string> = {
  points: "Points",
  rebounds: "Rebonds",
  assists: "Passes décisives",
  steals: "Interceptions",
  blocks: "Contres",
};

export function normalizeElLeaders(raw: RawElLeaders, clubs: Map<string, Team>): Leader[] {
  return (Object.keys(EL_LEADER_LABELS) as LeaderCategory[]).map((category) => ({
    category,
    label: EL_LEADER_LABELS[category],
    entries: (raw[category] ?? []).slice(0, 10).map((l) => ({
      rank: l.rank,
      playerId: l.details.code,
      name: prettyName(l.details.name),
      headshot: l.details.imageUrl,
      team: l.details.team
        ? (clubs.get(l.details.team.code) ?? {
            id: l.details.team.code,
            league: "euroleague" as const,
            name: l.details.team.name,
            shortName: l.details.team.name,
            abbreviation: l.details.team.code,
            logo: { light: l.details.team.imageUrl ?? "", dark: l.details.team.imageUrl ?? "" },
          })
        : undefined,
      value: l.average,
      displayValue: l.average.toFixed(1),
      gamesPlayed: l.gamesPlayed,
    })),
  }));
}

function ageFrom(birth?: string): number | undefined {
  if (!birth) return undefined;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

const POSITIONS_FR: Record<string, string> = { Guard: "Meneur/Arrière", Forward: "Ailier", Center: "Pivot" };

export function normalizeElPeople(people: RawElPerson[]): { roster: Player[]; coach?: string } {
  const roster: Player[] = people
    .filter((p) => p.type === "J" && p.active !== false)
    .map((p) => ({
      id: p.person.code,
      name: prettyName(p.person.name),
      jersey: p.dorsal || undefined,
      position: p.positionName ? (POSITIONS_FR[p.positionName] ?? p.positionName) : undefined,
      height: p.person.height ? `${p.person.height} cm` : undefined,
      weight: p.person.weight ? `${p.person.weight} kg` : undefined,
      age: ageFrom(p.person.birthDate),
      country: p.person.country?.name,
      headshot: p.images?.headshot ?? p.person.images?.headshot,
    }))
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));
  const coach = people.find((p) => p.type === "E");
  return { roster, coach: coach ? prettyName(coach.person.name) : undefined };
}
