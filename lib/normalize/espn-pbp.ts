/**
 * Traduction du play-by-play ESPN en français.
 *
 * ESPN publie chaque action sous forme de phrase anglaise libre (« Victor
 * Wembanyama misses 26-foot three point jumper »), avec une soixantaine de
 * variantes. Traduire le texte mot à mot serait fragile. On s'appuie plutôt
 * sur les champs structurés que fournit chaque action — `shootingPlay`,
 * `scoringPlay`, `pointsAttempted`, le type — et on ne tire du texte que ce
 * qu'il est seul à porter : les noms.
 *
 * Toute action qu'aucune règle ne reconnaît garde son texte d'origine : mieux
 * vaut une ligne en anglais qu'une ligne fausse ou absente.
 */

import type { Play } from "@/types";

export interface RawEspnPlay {
  id: string;
  sequenceNumber?: string;
  text?: string;
  type?: { text?: string };
  period?: { number?: number; displayValue?: string };
  clock?: { displayValue?: string };
  awayScore?: number;
  homeScore?: number;
  scoringPlay?: boolean;
  scoreValue?: number;
  shootingPlay?: boolean;
  pointsAttempted?: number;
  team?: { id?: string };
}

/** Motifs d'extraction des noms, du plus spécifique au plus général. */
const re = {
  substitution: /^(.+?) enters the game for (.+)$/,
  jumpball: /^(.+?) vs\. (.+?)(?: \((.+?) gains possession\))?$/,
  endPeriod: /^End of the (\d+)(?:st|nd|rd|th) (Quarter|Half|Overtime)/i,
  endGame: /^End of (?:the )?Game/i,
  timeout: /^(.+?) (?:full |20 sec\.? |short |regular |)timeout/i,
  freeThrow: /^(.+?) (makes|misses) (?:(technical|flagrant|clear path) )?free throw(?: (?:flagrant|technical|clear path))?(?: (\d) of (\d))?/i,
  teamRebound: /^(.+?) (offensive|defensive) team rebound/i,
  rebound: /^(.+?) (offensive|defensive) rebound/i,
  steal: /\((.+?) steals\)/,
  turnover: /^(.+?) .*turnover/i,
  block: /^(.+?) blocks (.+?) ?'s /,
  shot: /^(.+?) (makes|misses) /,
  assist: /\((.+?) assists\)/,
  foul: /^(.+?) (shooting|personal take|personal|offensive charge|offensive|loose ball|flagrant|technical|clear path|away from play|transition take|hanging tech) ?(?:foul|type)/i,
  violation: /^(.+?) (kicked ball|defensive goaltending|lane|delay of game|jump ball|double lane) violation/i,
  review: /^\(\d+:\d+\)/,
  ejection: /^(.+?) ejected/i,
};

const FAUTES: Record<string, string> = {
  shooting: "sur tir",
  personal: "personnelle",
  "personal take": "tactique",
  "transition take": "tactique",
  offensive: "offensive",
  "offensive charge": "offensive (passage en force)",
  "loose ball": "sur ballon libre",
  flagrant: "flagrante",
  technical: "technique",
  "clear path": "d'antijeu",
  "away from play": "loin du ballon",
  "hanging tech": "technique",
};

const VIOLATIONS: Record<string, string> = {
  "kicked ball": "pied",
  "defensive goaltending": "goaltending défensif",
  lane: "de raquette",
  "delay of game": "retard de jeu",
  "jump ball": "sur entre-deux",
  "double lane": "de raquette",
};

/** Nature du tir, pour une phrase plus parlante qu'un simple « tir ». */
function geste(type: string): string | undefined {
  const t = type.toLowerCase();
  if (t.includes("dunk")) return "smash";
  if (t.includes("alley oop")) return "alley-oop";
  if (t.includes("tip")) return "claquette";
  if (t.includes("hook")) return "bras roulé";
  if (t.includes("layup") || t.includes("finger roll")) return "lay-up";
  return undefined;
}

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

export function frenchPlay(p: RawEspnPlay): string {
  // Les textes ESPN contiennent parfois des retours à la ligne (« bad pass\nturnover »).
  const text = (p.text ?? "").replace(/\s+/g, " ").trim();
  const type = (p.type?.text ?? "").replace(/\s+/g, " ").trim();
  const lower = type.toLowerCase();
  let m: RegExpMatchArray | null;

  if ((m = text.match(re.substitution))) return `${m[1]} remplace ${m[2]}`;

  if (lower === "jumpball" && (m = text.match(re.jumpball)))
    return m[3] ? `Entre-deux ${m[1]} – ${m[2]}, possession pour ${m[3]}` : `Entre-deux ${m[1]} – ${m[2]}`;

  if (re.endGame.test(text)) return "Fin du match";
  if ((m = text.match(re.endPeriod))) {
    const n = Number(m[1]);
    const unite = m[2].toLowerCase();
    if (unite === "overtime") return n === 1 ? "Fin de la prolongation" : `Fin de la ${n}e prolongation`;
    if (unite === "half") return n === 1 ? "Mi-temps" : "Fin du match";
    return `Fin du ${ordinal(n)} quart-temps`;
  }

  if (lower.includes("timeout")) {
    if (/official/i.test(text)) return "Temps mort officiel";
    return (m = text.match(re.timeout)) ? `Temps mort ${m[1]}` : "Temps mort";
  }

  if (lower.startsWith("free throw") && (m = text.match(re.freeThrow))) {
    const verbe = m[2].toLowerCase() === "makes" ? "réussit" : "manque";
    const nature = m[3] ? { technical: " technique", flagrant: "", "clear path": "" }[m[3].toLowerCase()] ?? "" : "";
    return m[4] ? `${m[1]} ${verbe} le lancer franc${nature} ${m[4]}/${m[5]}` : `${m[1]} ${verbe} un lancer franc${nature}`;
  }

  if ((m = text.match(re.teamRebound)))
    return `Rebond ${m[2].toLowerCase() === "offensive" ? "offensif" : "défensif"} collectif ${m[1]}`;
  if ((m = text.match(re.rebound)))
    return `Rebond ${m[2].toLowerCase() === "offensive" ? "offensif" : "défensif"} de ${m[1]}`;

  // Le type ne mentionne pas toujours la perte de balle (« Traveling ») : le
  // texte, lui, le dit.
  if (lower.includes("turnover") || /turnover/i.test(text)) {
    if (/shot clock/i.test(text)) return "Violation des 24 secondes";
    if (/8 second/i.test(text)) return "Violation des 8 secondes";
    if (/5 second/i.test(text)) return "Violation des 5 secondes";
    if (/3 second/i.test(text)) return "Violation des 3 secondes";
    const vol = text.match(re.steal);
    const qui = text.match(re.turnover)?.[1];
    if (!qui) return text;
    const pourquoi = /offensive foul/i.test(text) ? " (faute offensive)" : /travel/i.test(text) ? " (marcher)" : "";
    return `Balle perdue de ${qui}${pourquoi}${vol ? `, interception de ${vol[1]}` : ""}`;
  }

  if ((m = text.match(re.block))) return `Contre de ${m[1]} sur ${m[2]}`;

  if (p.shootingPlay && (m = text.match(re.shot))) {
    const reussi = m[2] === "makes";
    const points = p.pointsAttempted === 3 ? 3 : 2;
    const g = geste(type);
    const passe = text.match(re.assist)?.[1];
    if (reussi) {
      const tir = g ? `sur un ${g}` : `à ${points} points`;
      return `${m[1]} marque ${tir}${passe ? `, passe de ${passe}` : ""}`;
    }
    return g ? `${m[1]} manque un ${g}` : `${m[1]} manque un tir à ${points} points`;
  }

  if ((m = text.match(re.foul))) return `Faute ${FAUTES[m[2].toLowerCase()] ?? "personnelle"} de ${m[1]}`;
  if (lower.includes("foul") && (m = text.match(/^(.+?) .*foul/i))) return `Faute de ${m[1]}`;

  if ((m = text.match(re.violation))) return `Violation (${VIOLATIONS[m[2].toLowerCase()] ?? m[2]}) de ${m[1]}`;

  if ((m = text.match(re.ejection))) return `${m[1]} est exclu du match`;

  if (re.review.test(text)) {
    if (/OVERTURNED/i.test(text)) return "Vidéo : décision annulée";
    if (/SUPPORTS|STANDS|CONFIRMED/i.test(text)) return "Vidéo : décision confirmée";
    return "Vidéo : décision en cours d'examen";
  }

  return text;
}

/** Une traduction a-t-elle eu lieu ? Utile pour mesurer la couverture. */
export const isTranslated = (p: RawEspnPlay) => frenchPlay(p) !== (p.text ?? "").replace(/\s+/g, " ").trim();

export function normalizeEspnPlays(raw: RawEspnPlay[]): Play[] {
  return raw.map((p) => ({
    id: String(p.id),
    period: Number(p.period?.number ?? 0),
    clock: p.clock?.displayValue ?? "",
    text: frenchPlay(p),
    teamId: p.team?.id,
    home: Number(p.homeScore ?? 0),
    away: Number(p.awayScore ?? 0),
    scoring: Boolean(p.scoringPlay),
    points: p.scoringPlay ? Number(p.scoreValue ?? 0) || undefined : undefined,
  }));
}
