/**
 * Tout ce que le résumé de match ESPN publie autour du score : feuille de
 * match, comparatif des équipes, meilleurs joueurs, probabilité de victoire,
 * infos pratiques, blessés, confrontations et vidéos.
 *
 * ESPN libelle tout en anglais. Les libellés sont traduits d'après les clés
 * stables (`fieldGoalPct`, `assists`…), jamais d'après le texte affiché ; une
 * clé inconnue garde son libellé d'origine plutôt que de disparaître.
 */

import { frInjury } from "@/lib/normalize/espn";
import type { RawEspnPlay } from "@/lib/normalize/espn-pbp";
import type {
  Boxscore,
  BoxTeam,
  GameInfo,
  GameInjury,
  GameLeader,
  GameStatus,
  GameVideo,
  HeadToHead,
  TeamComparison,
  WinProbabilityPoint,
} from "@/types";

/* -------------------------------- Brut -------------------------------- */

interface RawAthlete {
  id?: string;
  displayName?: string;
  fullName?: string;
  shortName?: string;
  jersey?: string;
  position?: { abbreviation?: string };
  headshot?: { href?: string };
}

export interface RawSummaryExtras {
  format?: {
    regulation?: { periods?: number; clock?: number };
    overtime?: { clock?: number };
  };
  boxscore?: {
    teams?: {
      team?: { id?: string };
      homeAway?: string;
      statistics?: { name: string; displayValue?: string; label?: string }[];
    }[];
    players?: {
      team?: { id?: string };
      statistics?: {
        keys?: string[];
        labels?: string[];
        descriptions?: string[];
        totals?: string[];
        athletes?: {
          athlete?: RawAthlete;
          starter?: boolean;
          didNotPlay?: boolean;
          reason?: string;
          ejected?: boolean;
          stats?: string[];
        }[];
      }[];
    }[];
  };
  gameInfo?: {
    venue?: {
      fullName?: string;
      address?: { city?: string; state?: string; country?: string };
    };
    attendance?: number;
    officials?: { displayName?: string; fullName?: string }[];
  };
  leaders?: {
    team?: { id?: string };
    leaders?: {
      name?: string;
      displayName?: string;
      leaders?: {
        displayValue?: string;
        summary?: string;
        athlete?: RawAthlete;
      }[];
    }[];
  }[];
  winprobability?: { homeWinPercentage?: number; playId?: string }[];
  injuries?: {
    team?: { id?: string };
    injuries?: {
      status?: string;
      athlete?: RawAthlete;
      details?: {
        type?: string;
        side?: string;
        detail?: string;
        returnDate?: string;
      };
    }[];
  }[];
  seasonseries?: {
    type?: string;
    title?: string;
    events?: {
      id?: string;
      date?: string;
      status?: string;
      competitors?: {
        winner?: boolean;
        score?: string;
        team?: { id?: string };
      }[];
    }[];
  }[];
  broadcasts?: { media?: { shortName?: string; name?: string } }[];
  videos?: {
    id?: number | string;
    headline?: string;
    duration?: number;
    thumbnail?: string;
    links?: { web?: { href?: string } };
  }[];
}

/* --------------------------- Feuille de match -------------------------- */

const COLONNES: Record<string, [string, string]> = {
  minutes: ["MIN", "Minutes jouées"],
  points: ["PTS", "Points"],
  "fieldGoalsMade-fieldGoalsAttempted": ["TIRS", "Tirs réussis / tentés"],
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted": ["3PTS", "Tirs à 3 points réussis / tentés"],
  "freeThrowsMade-freeThrowsAttempted": ["LF", "Lancers francs réussis / tentés"],
  rebounds: ["REB", "Rebonds"],
  assists: ["PD", "Passes décisives"],
  turnovers: ["BP", "Balles perdues"],
  steals: ["INT", "Interceptions"],
  blocks: ["CTR", "Contres"],
  offensiveRebounds: ["RO", "Rebonds offensifs"],
  defensiveRebounds: ["RD", "Rebonds défensifs"],
  fouls: ["F", "Fautes personnelles"],
  plusMinus: ["+/-", "Écart au score pendant que le joueur est sur le terrain"],
};

/** Motifs d'absence d'un joueur, tels qu'ESPN les écrit (en capitales). */
function motifAbsence(reason?: string): string {
  if (!reason) return "N'a pas joué";
  const r = reason.toUpperCase();
  if (r.includes("COACH")) return "Choix de l'entraîneur";
  if (r.includes("NOT WITH TEAM")) return "Absent du groupe";
  if (r.startsWith("INJURY") || r.includes("ILLNESS")) {
    const detail = reason.split("-").slice(1).join("-").trim();
    return detail ? `Blessure : ${partieDuCorps(detail)}` : "Blessure";
  }
  if (r.includes("SUSPEN")) return "Suspendu";
  if (r.includes("PERSONAL")) return "Raisons personnelles";
  if (r.includes("REST")) return "Repos";
  if (r.includes("G LEAGUE") || r.includes("G-LEAGUE")) return "En G League";
  if (r.includes("CONCUSSION")) return "Protocole commotion";
  return reason.charAt(0) + reason.slice(1).toLowerCase();
}

export function normalizeBoxscore(raw: RawSummaryExtras["boxscore"]): Boxscore | undefined {
  const equipes = raw?.players ?? [];
  const premiere = equipes[0]?.statistics?.[0];
  if (!premiere?.keys?.length) return undefined;
  const columns = premiere.keys.map((k, i) => {
    const [abbr, title] = COLONNES[k] ?? [premiere.labels?.[i] ?? k, premiere.descriptions?.[i] ?? k];
    return { abbr, title };
  });
  const teams: BoxTeam[] = equipes.map((e) => {
    const s = e.statistics?.[0];
    return {
      teamId: String(e.team?.id ?? ""),
      totals: s?.totals ?? [],
      players: (s?.athletes ?? []).map((a) => {
        const stats = a.stats ?? [];
        const absent = a.didNotPlay || stats.length === 0;
        return {
          id: String(a.athlete?.id ?? ""),
          name: a.athlete?.displayName ?? "",
          shortName: a.athlete?.shortName ?? a.athlete?.displayName ?? "",
          jersey: a.athlete?.jersey,
          position: a.athlete?.position?.abbreviation,
          headshot: a.athlete?.headshot?.href,
          starter: Boolean(a.starter),
          dnp: absent ? motifAbsence(a.reason) : undefined,
          ejected: a.ejected || undefined,
          stats,
        };
      }),
    };
  });
  return { columns, teams };
}

/* ------------------------------ Comparatif ------------------------------ */

/** [clé ESPN, libellé, la plus grande valeur est-elle la meilleure ?] */
const COMPARATIF: [string, string, boolean][] = [
  ["fieldGoalsMade-fieldGoalsAttempted", "Tirs réussis", true],
  ["fieldGoalPct", "% aux tirs", true],
  ["threePointFieldGoalsMade-threePointFieldGoalsAttempted", "Tirs à 3 points", true],
  ["threePointFieldGoalPct", "% à 3 points", true],
  ["freeThrowsMade-freeThrowsAttempted", "Lancers francs", true],
  ["freeThrowPct", "% aux lancers francs", true],
  ["totalRebounds", "Rebonds", true],
  ["offensiveRebounds", "Rebonds offensifs", true],
  ["defensiveRebounds", "Rebonds défensifs", true],
  ["assists", "Passes décisives", true],
  ["steals", "Interceptions", true],
  ["blocks", "Contres", true],
  ["totalTurnovers", "Balles perdues", false],
  ["turnoverPoints", "Points concédés sur balles perdues", false],
  ["fastBreakPoints", "Points en contre-attaque", true],
  ["pointsInPaint", "Points dans la raquette", true],
  ["fouls", "Fautes", false],
  ["totalTechnicalFouls", "Fautes techniques", false],
  ["flagrantFouls", "Fautes flagrantes", false],
  ["largestLead", "Plus grand écart en tête", true],
  ["leadChanges", "Changements de leader", true],
  ["leadPercentage", "% du temps en tête", true],
];

/** « 21-62 » compte pour ses tirs réussis, « 34 » pour lui-même. */
const valeur = (v?: string) => {
  const n = Number((v ?? "").split("-")[0]);
  return v && Number.isFinite(n) ? n : undefined;
};

export function normalizeComparison(raw: RawSummaryExtras["boxscore"]): TeamComparison[] | undefined {
  const teams = raw?.teams ?? [];
  const away = teams.find((t) => t.homeAway === "away")?.statistics;
  const home = teams.find((t) => t.homeAway === "home")?.statistics;
  if (!away?.length || !home?.length) return undefined;
  const lire = (s: typeof away, k: string) => s.find((x) => x.name === k)?.displayValue;
  const pct = (k: string, v?: string) => (v && k.endsWith("Pct") ? `${v} %` : v) ?? "";
  const lignes: TeamComparison[] = [];
  for (const [k, label, higherIsBetter] of COMPARATIF) {
    const a = lire(away, k);
    const h = lire(home, k);
    if (a === undefined && h === undefined) continue;
    lignes.push({
      label,
      away: pct(k, a),
      home: pct(k, h),
      awayValue: valeur(a),
      homeValue: valeur(h),
      higherIsBetter: k === "leadChanges" ? true : higherIsBetter,
    });
  }
  return lignes;
}

/* ---------------------------- Meilleurs joueurs ---------------------------- */

const CATEGORIES: Record<string, string> = {
  points: "Points",
  rebounds: "Rebonds",
  assists: "Passes décisives",
  pointsPerGame: "Points / match",
  reboundsPerGame: "Rebonds / match",
  assistsPerGame: "Passes / match",
};

/** « 9/18 FG, 3/3 FT » → « 9/18 tirs, 3/3 LF ». */
const ligneFr = (s?: string) =>
  s
    ?.replace(/\b3PT\b/g, "à 3 pts")
    .replace(/\bFG\b/g, "tirs")
    .replace(/\bFT\b/g, "LF")
    .replace(/\bOREB\b/g, "rbd off.")
    .replace(/\bDREB\b/g, "rbd déf.")
    .replace(/\bMIN\b/g, "min")
    .replace(/\bREB\b/g, "rbd")
    .replace(/\bAST\b/g, "pd")
    .replace(/\bSTL\b/g, "int")
    .replace(/\bBLK\b/g, "ctr")
    .replace(/\bTO\b/g, "bp");

export function normalizeGameLeaders(raw: RawSummaryExtras["leaders"]): GameLeader[] | undefined {
  const out: GameLeader[] = [];
  for (const equipe of raw ?? []) {
    for (const cat of equipe.leaders ?? []) {
      const best = cat.leaders?.[0];
      if (!best?.athlete) continue;
      out.push({
        category: CATEGORIES[cat.name ?? ""] ?? cat.displayName ?? cat.name ?? "",
        teamId: String(equipe.team?.id ?? ""),
        player: {
          id: String(best.athlete.id ?? ""),
          name: best.athlete.displayName ?? "",
          headshot: best.athlete.headshot?.href,
          position: best.athlete.position?.abbreviation,
          jersey: best.athlete.jersey,
        },
        value: best.displayValue ?? "",
        line: ligneFr(best.summary),
      });
    }
  }
  return out.length ? out : undefined;
}

/* ------------------------- Probabilité de victoire ------------------------- */

/** « 9:27 » ou « 45.2 » (dernière minute) → secondes restantes. */
function secondes(clock?: string): number {
  if (!clock) return 0;
  const [m, s] = clock.includes(":") ? clock.split(":") : ["0", clock];
  return Number(m) * 60 + Number(s) || 0;
}

export function regulationSeconds(format: RawSummaryExtras["format"]): number {
  return (format?.regulation?.periods ?? 4) * (format?.regulation?.clock ?? 600);
}

/**
 * Courbe de probabilité de victoire. ESPN la publie action par action, liée au
 * play-by-play par identifiant : c'est l'action qui donne le moment du match.
 * La courbe est allégée à quelques centaines de points, ce qui ne change rien
 * à l'œil et divise le poids de la réponse.
 */
export function normalizeWinProbability(
  raw: RawSummaryExtras["winprobability"],
  plays: RawEspnPlay[],
  format: RawSummaryExtras["format"],
  final?: { homeWon: boolean },
): WinProbabilityPoint[] | undefined {
  if (!raw?.length) return undefined;
  const parId = new Map(plays.map((p) => [p.id, p]));
  const periodes = format?.regulation?.periods ?? 4;
  const duree = format?.regulation?.clock ?? 600;
  const prolongation = format?.overtime?.clock ?? 300;

  const points: WinProbabilityPoint[] = [];
  for (const w of raw) {
    const p = w.playId ? parId.get(w.playId) : undefined;
    const period = p?.period?.number;
    if (!p || !period || typeof w.homeWinPercentage !== "number") continue;
    const restant = secondes(p.clock?.displayValue);
    const elapsed =
      period <= periodes
        ? (period - 1) * duree + (duree - restant)
        : periodes * duree + (period - periodes - 1) * prolongation + (prolongation - restant);
    points.push({
      elapsed,
      home: w.homeWinPercentage,
      period,
      clock: p.clock?.displayValue ?? "",
    });
  }
  if (!points.length) return undefined;

  // ESPN publie certaines corrections après coup : une action du 2e quart-temps
  // peut arriver après le buzzer final. On remet la courbe dans l'ordre du jeu.
  points.sort((a, b) => a.elapsed - b.elapsed);

  // Au coup de sifflet final, l'issue est certaine : ESPN s'arrête parfois juste avant.
  const dernier = points.at(-1)!;
  if (final) points.push({ ...dernier, home: final.homeWon ? 1 : 0 });

  const pas = Math.ceil(points.length / 300);
  return points.filter((_, i) => i % pas === 0 || i === points.length - 1);
}

/* ------------------------------ Infos pratiques ------------------------------ */

export function normalizeGameInfo(
  info: RawSummaryExtras["gameInfo"],
  broadcasts: RawSummaryExtras["broadcasts"],
): GameInfo | undefined {
  const adresse = info?.venue?.address;
  const out: GameInfo = {
    venue: info?.venue?.fullName,
    city: [adresse?.city, adresse?.state ?? adresse?.country].filter(Boolean).join(", ") || undefined,
    attendance: info?.attendance || undefined,
    officials: (info?.officials ?? []).map((o) => o.displayName ?? o.fullName ?? "").filter(Boolean),
    // Le nom complet (« ESPN Radio ») plutôt que l'indicatif (« ERADM »).
    broadcasts: [...new Set((broadcasts ?? []).map((b) => b.media?.name ?? b.media?.shortName ?? "").filter(Boolean))],
  };
  return out.venue || out.attendance || out.officials.length || out.broadcasts.length ? out : undefined;
}

/* --------------------------------- Blessés --------------------------------- */

const CORPS: Record<string, string> = {
  abdomen: "abdomen",
  achilles: "tendon d'Achille",
  ankle: "cheville",
  back: "dos",
  calf: "mollet",
  chest: "poitrine",
  concussion: "commotion cérébrale",
  elbow: "coude",
  eye: "œil",
  face: "visage",
  finger: "doigt",
  foot: "pied",
  groin: "aine",
  hamstring: "ischio-jambiers",
  hand: "main",
  head: "tête",
  hip: "hanche",
  illness: "maladie",
  knee: "genou",
  leg: "jambe",
  neck: "cou",
  "not injury related": "hors blessure",
  personal: "raisons personnelles",
  quadriceps: "quadriceps",
  rest: "repos",
  ribs: "côtes",
  shin: "tibia",
  shoulder: "épaule",
  thigh: "cuisse",
  thumb: "pouce",
  toe: "orteil",
  wrist: "poignet",
};

function partieDuCorps(type: string): string {
  return CORPS[type.toLowerCase().trim()] ?? type;
}

const COTE: Record<string, string> = { left: "gauche", right: "droit" };

export function normalizeGameInjuries(raw: RawSummaryExtras["injuries"]): GameInjury[] | undefined {
  const out: GameInjury[] = [];
  for (const equipe of raw ?? []) {
    for (const i of equipe.injuries ?? []) {
      const type = i.details?.type;
      const cote = COTE[i.details?.side?.toLowerCase() ?? ""];
      const detail = type ? `${partieDuCorps(type)}${cote ? ` (côté ${cote})` : ""}` : undefined;
      out.push({
        teamId: String(equipe.team?.id ?? ""),
        player: i.athlete?.displayName ?? i.athlete?.fullName ?? "",
        headshot: i.athlete?.headshot?.href,
        status: frInjury(i.status) ?? "Incertain",
        detail: detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : undefined,
        returnDate: i.details?.returnDate,
      });
    }
  }
  return out.length ? out : undefined;
}

/* ------------------------------ Confrontations ------------------------------ */

const statut = (s?: string): GameStatus => (s === "post" ? "final" : s === "in" ? "live" : "scheduled");

export function normalizeHeadToHead(raw: RawSummaryExtras["seasonseries"]): HeadToHead[] | undefined {
  const out = (raw ?? [])
    .filter((s) => s.events?.length)
    .map((s) => {
      const wins: Record<string, number> = {};
      const games = (s.events ?? []).map((e) => {
        const scores: Record<string, number | null> = {};
        for (const c of e.competitors ?? []) {
          const id = String(c.team?.id ?? "");
          scores[id] = c.score !== undefined && c.score !== "" ? Number(c.score) : null;
          wins[id] ??= 0;
          if (e.status === "post" && c.winner) wins[id]++;
        }
        return {
          id: String(e.id ?? ""),
          date: e.date ?? "",
          status: statut(e.status),
          scores,
        };
      });
      return {
        title: s.type === "playoff" ? "Série de playoffs" : "Saison régulière",
        wins,
        games,
      };
    });
  return out.length ? out : undefined;
}

/* --------------------------------- Vidéos --------------------------------- */

export function normalizeVideos(raw: RawSummaryExtras["videos"]): GameVideo[] | undefined {
  const out = (raw ?? [])
    .filter((v) => v.links?.web?.href && v.headline)
    .map((v) => ({
      id: String(v.id),
      title: v.headline!,
      thumbnail: v.thumbnail,
      url: v.links!.web!.href!,
      duration: v.duration,
    }));
  return out.length ? out : undefined;
}
