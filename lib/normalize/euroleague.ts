import type { Club, ClubRosterMember, PlayerLeader, Standing } from "euroleague-api";
import type { Game, GameStatus, GameTeam, Leader, LeaderCategory, Play, Player, StandingRow, Team } from "@/types";

/**
 * Conversion des réponses du SDK `euroleague-api` vers le modèle commun.
 *
 * Le SDK valide déjà les réponses et les livre en camelCase ; il reste à les
 * traduire dans nos types et en français. Deux champs arrivent en revanche
 * sous forme de chaîne JSON (le club d'une ligne de classement, le joueur
 * d'une ligne de leaders) : ils sont analysés ici.
 */
function parseNested<T>(value: unknown): T | undefined {
  if (value && typeof value === "object") return value as T;
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

/* ------------------------------ Clubs ------------------------------- */

interface ClubLike {
  code: string;
  name?: string | null;
  editorialName?: string | null;
  abbreviatedName?: string | null;
  tvCode?: string | null;
  city?: string | null;
  country?: { name?: string | null } | null;
  images?: { crest?: string | null } | null;
}

/** « JONES, DAMIAN » → « Damian Jones » */
export function prettyName(raw: string): string {
  const [last, first] = raw.split(",").map((s) => s.trim());
  const cap = (s: string) =>
    s
      .toLowerCase()
      .replace(/(^|[\s'-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return first ? `${cap(first)} ${cap(last)}` : cap(last);
}

export function normalizeClub(c: Club | ClubLike): Team {
  const club = c as ClubLike;
  const crest = club.images?.crest ?? "";
  const name = club.name ?? club.code;
  return {
    id: club.code,
    league: "euroleague",
    name,
    shortName: club.editorialName ?? club.abbreviatedName ?? name,
    abbreviation: club.tvCode ?? club.code,
    logo: { light: crest, dark: crest },
    location: [club.city ? prettyName(club.city) : undefined, club.country?.name].filter(Boolean).join(", ") || undefined,
  };
}

/* ------------------------------ Matchs ------------------------------ */

/**
 * Vues typées des réponses du SDK.
 *
 * Le SDK valide les réponses à l'exécution mais les expose comme des
 * enregistrements génériques (`Record<string, JsonValue>`), en laissant le
 * typage au consommateur — c'est ce que recommande sa documentation. On décrit
 * donc ici les seuls champs que l'application exploite, et la conversion se
 * fait en un point unique, à la frontière du client.
 */
export interface ElSide {
  club: ClubLike;
  score?: number | null;
  partials?: {
    partials1?: number | null;
    partials2?: number | null;
    partials3?: number | null;
    partials4?: number | null;
    extraPeriods?: Record<string, number> | null;
  } | null;
}

export interface ElGame {
  identifier: string;
  gameCode: number;
  played: boolean;
  utcDate: string;
  gameStatus?: string | null;
  round?: number | null;
  roundName?: string | null;
  phaseType?: string | { code?: string } | null;
  group?: { rawName?: string | null } | null;
  venue?: { name?: string | null } | null;
  local: ElSide;
  road: ElSide;
}

/** Flux en direct d'une rencontre (cumuls par quart-temps, temps de jeu). */
export interface ElMeta {
  live?: boolean | null;
  round?: number | null;
  codeTeamA?: string | null;
  codeTeamB?: string | null;
  scoreA?: number | null;
  scoreB?: number | null;
  gameTime?: string | null;
  remainingPartialTime?: string | null;
  quarter?: string | null;
  scoreExtraTimeA?: number | null;
  scoreExtraTimeB?: number | null;
  [key: string]: unknown;
}

function periodsOf(side: ElSide): number[] {
  const p = side.partials ?? {};
  const base = [p.partials1, p.partials2, p.partials3, p.partials4].map((v) => Number(v ?? 0));
  const extra = Object.keys(p.extraPeriods ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => Number(p.extraPeriods?.[k] ?? 0));
  return [...base, ...extra];
}

/** Scores par période à partir des cumuls du flux en direct. */
function livePeriods(m: ElMeta, s: "A" | "B"): number[] {
  const current = Number.parseInt(String(m.quarter ?? ""), 10) || 4;
  const out: number[] = [];
  let prev = 0;
  for (let q = 1; q <= Math.min(current, 4); q++) {
    const cum = Number(m[`scoreQuarter${q}${s}`] ?? 0);
    out.push(Math.max(0, cum - prev));
    prev = Math.max(prev, cum);
  }
  // Le quart-temps courant est vide sur un match terminé : on se fie au score
  // de prolongation, qui ne dépasse celui du temps réglementaire que s'il y en
  // a eu une.
  const ot = Number(m[`scoreExtraTime${s}`] ?? 0);
  if (ot > prev) out.push(ot - prev);
  return out;
}

export const LIVE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Durée réglementaire, prolongations exclues. */
const TEMPS_REGLEMENTAIRE_MIN = 40;

/**
 * Le match est-il terminé, d'après le flux en direct ?
 *
 * `live` reste à `true` longtemps après le coup de sifflet final, et le
 * calendrier met des heures à basculer `played`. Sans autre critère, un match
 * fini restait affiché « en direct · 00:00 ». Le couple temps joué / temps
 * restant, lui, est sans ambiguïté : 40:00 joué et 00:00 restant.
 *
 * Si une prolongation démarre, le flux repasse à un temps restant non nul au
 * relevé suivant et le match redevient « en cours » : la décision se corrige
 * d'elle-même.
 */
function metaTermine(m: ElMeta): boolean {
  const joue = Number(String(m.gameTime ?? "").split(":")[0]);
  return (
    Number.isFinite(joue) && joue >= TEMPS_REGLEMENTAIRE_MIN && String(m.remainingPartialTime ?? "").trim() === "00:00"
  );
}

export function normalizeElGame(g: ElGame, meta?: ElMeta | null): Game {
  const start = new Date(g.utcDate).getTime();
  const now = Date.now();
  let status: GameStatus = "scheduled";
  if (/postpon|cancel/i.test(String(g.gameStatus ?? ""))) status = "postponed";
  else if (g.played) status = "final";
  else if (meta && metaTermine(meta)) status = "final";
  else if (meta?.live || (now >= start && now < start + LIVE_WINDOW_MS && meta)) status = "live";

  // Tant que le calendrier n'a pas basculé, c'est le flux en direct qui porte
  // le score — y compris pour un match qu'il vient de déclarer fini.
  const duDirect = Boolean(meta) && !g.played && status !== "scheduled" && status !== "postponed";
  const hasPartials = status !== "scheduled";
  const homePeriods = duDirect ? livePeriods(meta!, "A") : hasPartials ? periodsOf(g.local) : [];
  const awayPeriods = duDirect ? livePeriods(meta!, "B") : hasPartials ? periodsOf(g.road) : [];
  const homeScore = duDirect ? Number(meta!.scoreA ?? 0) : Number(g.local.score ?? 0);
  const awayScore = duDirect ? Number(meta!.scoreB ?? 0) : Number(g.road.score ?? 0);

  const side = (s: ElSide, score: number, periods: number[], other: number, isHome: boolean): GameTeam => ({
    team: normalizeClub(s.club),
    score: status === "scheduled" || status === "postponed" ? null : score,
    periods,
    winner: status === "final" && score > other,
    isHome,
  });

  const otCount = Math.max(homePeriods.length, awayPeriods.length) - 4;
  let statusDetail = "À venir";
  if (status === "final")
    statusDetail = otCount > 0 ? (otCount > 1 ? `Terminé (${otCount} prol.)` : "Terminé (prol.)") : "Terminé";
  else if (status === "postponed") statusDetail = "Reporté";
  else if (status === "live") {
    const q = String(meta?.quarter ?? "").trim();
    const restant = String(meta?.remainingPartialTime ?? "").trim();
    const joue = Number(String(meta?.gameTime ?? "").split(":")[0]);
    // Entre deux quarts-temps, le flux vide le numéro de période et affiche
    // 00:00 : sans cela on lisait « En cours · 00:00 » à la mi-temps. Le temps
    // de jeu écoulé dit de quelle pause il s'agit (relevé : 20:00 à la mi-temps).
    const pause: Record<number, string> = { 10: "Fin Q1", 20: "Mi-temps", 30: "Fin Q3" };
    if (!q && restant === "00:00" && pause[joue]) statusDetail = pause[joue];
    else statusDetail = [q ? `Q${q}` : "En cours", restant].filter(Boolean).join(" · ");
  }

  const phase = typeof g.phaseType === "string" ? g.phaseType : (g.phaseType as { code?: string } | null)?.code;
  return {
    id: g.identifier,
    league: "euroleague",
    date: g.utcDate,
    status,
    statusDetail,
    home: side(g.local, homeScore, homePeriods, awayScore, true),
    away: side(g.road, awayScore, awayPeriods, homeScore, false),
    venue: g.venue?.name ? prettyName(g.venue.name) : undefined,
    phase: phase && phase !== "RS" ? (g.group?.rawName ?? phase) : undefined,
    round: g.roundName?.replace("Round", "Journée"),
  };
}

/* ---------------------------- Classement ---------------------------- */

export function normalizeElStandings(rows: Standing[]): StandingRow[] {
  return rows.map((r) => {
    const club = parseNested<ClubLike>(r.club);
    const played = Number(r.gamesPlayed ?? 0);
    const wins = Number(r.gamesWon ?? 0);
    const diff = Number(String(r.pointsDifference ?? "0").replace("+", ""));
    return {
      team: normalizeClub(club ?? { code: String(r.club ?? "") }),
      rank: Number(r.position ?? 0),
      seed: Number(r.position ?? 0),
      played,
      wins,
      losses: Number(r.gamesLost ?? 0),
      winPct: played ? wins / played : 0,
      diff: Number.isFinite(diff) ? diff : 0,
      pointsFor: Number(r.pointsFor ?? 0),
      pointsAgainst: Number(r.pointsAgainst ?? 0),
      // `last5Form` arrive en chaîne JSON, comme le club.
      streak: parseNested<string[]>(r.last5Form)
        ?.map((f) => (f === "W" ? "V" : f === "L" ? "D" : String(f)))
        .join(""),
    };
  });
}

/* ------------------------------ Leaders ----------------------------- */

const EL_LEADER_LABELS: Record<LeaderCategory, string> = {
  points: "Points",
  rebounds: "Rebonds",
  assists: "Passes décisives",
  steals: "Interceptions",
  blocks: "Contres",
};

/** Nom de la statistique côté SDK, pour chacune de nos catégories. */
export const EL_LEADER_STATS: Record<LeaderCategory, string> = {
  points: "pointsScored",
  rebounds: "totalRebounds",
  assists: "assists",
  steals: "steals",
  blocks: "blocks",
};

interface PlayerLike {
  code?: string;
  name?: string;
  imageUrl?: string;
  team?: { code?: string; name?: string; imageUrl?: string };
}

export function normalizeElLeaders(
  parCategorie: Record<LeaderCategory, PlayerLeader[]>,
  clubs: Map<string, Team>,
): Leader[] {
  return (Object.keys(EL_LEADER_LABELS) as LeaderCategory[]).map((category) => {
    const stat = EL_LEADER_STATS[category];
    // `playerRanking` classe du plus faible au plus fort : on trie nous-mêmes
    // sur la valeur, sans quoi le « top 10 » serait le fond du classement.
    const entries = [...(parCategorie[category] ?? [])]
      .map((row) => ({ row, value: Number(row[stat as keyof PlayerLeader] ?? 0) }))
      .filter((x) => Number.isFinite(x.value))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map(({ row, value }, i) => {
        const p = parseNested<PlayerLike>(row.player) ?? {};
        const teamCode = p.team?.code ?? "";
        return {
          rank: i + 1,
          playerId: p.code ?? `${category}-${i}`,
          name: p.name ? prettyName(p.name) : "",
          headshot: p.imageUrl,
          team:
            clubs.get(teamCode) ??
            (p.team
              ? {
                  id: teamCode,
                  league: "euroleague" as const,
                  name: p.team.name ?? teamCode,
                  shortName: p.team.name ?? teamCode,
                  abbreviation: teamCode,
                  logo: { light: p.team.imageUrl ?? "", dark: p.team.imageUrl ?? "" },
                }
              : undefined),
          value,
          displayValue: value.toFixed(1),
          gamesPlayed: Number(row.gamesPlayed ?? 0) || undefined,
        };
      });
    return { category, label: EL_LEADER_LABELS[category], entries };
  });
}

/* ------------------------------ Effectif ---------------------------- */

function ageFrom(birth?: string | null): number | undefined {
  if (!birth) return undefined;
  const b = new Date(birth);
  if (Number.isNaN(b.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

const POSITIONS_FR: Record<string, string> = { Guard: "Meneur/Arrière", Forward: "Ailier", Center: "Pivot" };

export function normalizeElPeople(people: ClubRosterMember[]): { roster: Player[]; coach?: string } {
  const roster: Player[] = people
    .filter((p) => p.type === "J" && p.active !== false)
    .map((p) => ({
      id: p.person.code,
      name: prettyName(p.person.name),
      jersey: p.dorsal ? String(p.dorsal) : undefined,
      position: p.positionName ? (POSITIONS_FR[p.positionName] ?? p.positionName) : undefined,
      height: p.person.height ? `${p.person.height} cm` : undefined,
      weight: p.person.weight ? `${p.person.weight} kg` : undefined,
      age: ageFrom(p.person.birthDate),
      country: p.person.country?.name ?? undefined,
      headshot: p.images?.headshot ?? p.person.images?.headshot ?? undefined,
    }))
    .sort((a, b) => Number(a.jersey ?? 999) - Number(b.jersey ?? 999));
  const coach = people.find((p) => p.type === "E");
  return { roster, coach: coach ? prettyName(coach.person.name) : undefined };
}

/* --------------------------- Play-by-play --------------------------- */

/** Vue typée d'une action du play-by-play EuroLeague. */
export interface ElPlay {
  numberofplay?: number | null;
  playtype?: string | null;
  player?: string | null;
  codeteam?: string | null;
  team?: string | null;
  markertime?: string | null;
  period?: number | null;
  pointsA?: number | null;
  pointsB?: number | null;
  playinfo?: string | null;
}

const ordinalFr = (n: number) => (n === 1 ? "1er" : `${n}e`);

/**
 * Chaque action porte un code stable (« 3FGM », « TO », « D »…) : on traduit
 * le code, pas la phrase anglaise qui l'accompagne. Un code inconnu garde sa
 * description d'origine plutôt que de disparaître.
 */
function frenchElPlay(p: ElPlay): string {
  const code = String(p.playtype ?? "").trim();
  const qui = p.player ? prettyName(p.player) : "";
  const equipe = p.team ?? "";
  // Rebonds et pertes de balle peuvent être collectifs : pas de joueur, seulement
  // une équipe. Sans ce cas, on affichait « Rebond offensif de » suivi de rien.
  const de = (action: string, collectif: string) => (qui ? `${action} de ${qui}` : `${collectif} ${equipe}`.trim());
  const periode = Number(p.period ?? 0);
  const periodeFr = periode > 4 ? (periode === 5 ? "de la prolongation" : `de la ${periode - 4}e prolongation`) : `du ${ordinalFr(periode)} quart-temps`;
  switch (code) {
    case "2FGM": return `${qui} marque à 2 points`;
    case "2FGA": return `${qui} manque un tir à 2 points`;
    case "3FGM": return `${qui} marque à 3 points`;
    case "3FGA": return `${qui} manque un tir à 3 points`;
    case "FTM": return `${qui} réussit un lancer franc`;
    case "FTA": return `${qui} manque un lancer franc`;
    case "D": return de("Rebond défensif", "Rebond défensif collectif");
    case "O": return de("Rebond offensif", "Rebond offensif collectif");
    case "AS": return `Passe décisive de ${qui}`;
    case "ST": return `Interception de ${qui}`;
    case "TO": return de("Balle perdue", "Balle perdue");
    case "FV": return `Contre de ${qui}`;
    case "AG": return `${qui} se fait contrer`;
    case "CM": return `Faute de ${qui}`;
    case "CMT": return `Faute technique de ${qui || equipe}`;
    case "CMU": return `Faute antisportive de ${qui}`;
    case "CMD": return `Faute disqualifiante de ${qui}`;
    case "OF": return `Faute offensive de ${qui}`;
    case "RV": return `Faute provoquée par ${qui}`;
    case "IN": return `${qui} entre en jeu`;
    case "OUT": return `${qui} sort`;
    case "TOUT": return `Temps mort ${equipe}`;
    case "TOUT_TV": return "Temps mort télévisé";
    case "JB": return "Entre-deux";
    case "BP": return `Début ${periodeFr}`;
    case "EP": return `Fin ${periodeFr}`;
    case "EG": return "Fin du match";
    default: return [qui, p.playinfo].filter(Boolean).join(" — ") || code;
  }
}

const POINTS_EL: Record<string, number> = { "2FGM": 2, "3FGM": 3, FTM: 1 };

/** « 05:47 » → 347 secondes restantes dans la période. */
function secondesRestantes(p: ElPlay): number {
  const code = String(p.playtype ?? "").trim();
  if (code === "BP") return Number.POSITIVE_INFINITY;
  if (code === "EP" || code === "EG") return Number.NEGATIVE_INFINITY;
  const m = String(p.markertime ?? "").trim().match(/^(\d+):(\d+)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}

export function normalizeElPlays(raw: ElPlay[]): Play[] {
  // Deux sources d'ordre, aucune parfaite :
  //
  // - l'ordre de saisie (`numberofplay`) : certaines actions sont enregistrées
  //   après coup, et le chrono se lit alors 05:24, 05:57, 05:47, 05:57… ;
  // - le chrono : certaines horloges sont mal saisies, et trier dessus a fait
  //   passer un panier avant un autre — le score affiché reculait (15-19 puis
  //   12-19), une erreur factuelle.
  //
  // Le score cumulé, lui, ne ment pas : on ne saisit pas 19 avant 16. Les
  // paniers gardent donc leur ordre de saisie, et on ne trie au chrono que les
  // actions situées entre deux paniers, là où le score ne bouge pas et où un
  // déplacement ne peut rien fausser.
  //
  // Le score n'est renseigné que sur les paniers, et parfois d'un seul côté
  // (« 3 - null » au premier panier) : on reporte la dernière valeur connue.
  // A désigne l'équipe à domicile, B celle à l'extérieur — vérifié sur le
  // score final d'un match terminé.
  const saisie = [...raw].sort(
    (a, b) =>
      Number(a.period ?? 0) - Number(b.period ?? 0) || Number(a.numberofplay ?? 0) - Number(b.numberofplay ?? 0),
  );

  let home = 0;
  let away = 0;
  const actions = saisie.map((p, i) => {
    if (p.pointsA != null) home = Number(p.pointsA);
    if (p.pointsB != null) away = Number(p.pointsB);
    const code = String(p.playtype ?? "").trim();
    const points = POINTS_EL[code];
    const play: Play = {
      id: `el-${p.numberofplay ?? i}`,
      period: Number(p.period ?? 0),
      clock: String(p.markertime ?? "").trim(),
      text: frenchElPlay(p),
      teamId: p.codeteam?.trim() || undefined,
      home,
      away,
      scoring: points !== undefined,
      points,
    };
    return { play, raw: p };
  });

  // Découpage en séquences : chacune s'ouvre sur un panier (ou un changement de
  // période), qui reste en tête ; les actions qui suivent sont triées au chrono.
  const out: Play[] = [];
  let sequence: typeof actions = [];
  const vider = () => {
    const [tete, ...reste] = sequence;
    if (!tete) return;
    const ordonne = tete.play.scoring ? [tete, ...trier(reste)] : trier(sequence);
    out.push(...ordonne.map((a) => a.play));
    sequence = [];
  };
  const trier = (xs: typeof actions) =>
    [...xs].sort(
      (a, b) =>
        secondesRestantes(b.raw) - secondesRestantes(a.raw) ||
        Number(a.raw.numberofplay ?? 0) - Number(b.raw.numberofplay ?? 0),
    );
  for (const a of actions) {
    const precedente = sequence[sequence.length - 1];
    if (precedente && (a.play.scoring || a.play.period !== precedente.play.period)) vider();
    sequence.push(a);
  }
  vider();
  return out;
}
