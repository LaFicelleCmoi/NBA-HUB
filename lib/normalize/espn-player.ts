/**
 * Fiche joueur ESPN en français : identité, palmarès, chiffres de la saison,
 * carrière saison par saison (saison régulière et playoffs) et matchs de la
 * saison en cours.
 *
 * Les colonnes sont traduites d'après les abréviations d'ESPN, et l'ordre est
 * celui qu'ESPN publie : il n'est pas le même en NBA et en WNBA, on ne le
 * suppose donc jamais. Une abréviation inconnue garde son libellé d'origine.
 */

import { espnLogo } from "@/lib/normalize/espn";
import type { CareerTable, LeagueId, PlayerGame, PlayerProfile, StatColumn } from "@/types";

/* -------------------------------- Brut -------------------------------- */

interface RawTeamRef {
  id?: string;
  abbreviation?: string;
  displayName?: string;
  logo?: string;
  color?: string;
}

export interface RawAthleteBio {
  athlete?: {
    id?: string;
    displayName?: string;
    displayJersey?: string;
    jersey?: string;
    position?: { displayName?: string; abbreviation?: string };
    headshot?: { href?: string };
    active?: boolean;
    team?: RawTeamRef;
    age?: number;
    displayDOB?: string;
    displayBirthPlace?: string;
    displayHeight?: string;
    displayWeight?: string;
    college?: { name?: string };
    displayDraft?: string;
    displayExperience?: string;
    debutYear?: number;
    status?: { name?: string };
    statsSummary?: {
      displayName?: string;
      statistics?: { name?: string; displayName?: string; displayValue?: string; rankDisplayValue?: string }[];
    };
  };
}

export interface RawAthleteStats {
  teams?: Record<string, { id?: string; abbreviation?: string }>;
  categories?: {
    name?: string;
    labels?: string[];
    displayNames?: string[];
    statistics?: { teamId?: string; teamSlug?: string; season?: { displayName?: string }; stats?: string[] }[];
    totals?: string[];
  }[];
}

export interface RawAthleteOverview {
  statistics?: { labels?: string[]; displayNames?: string[]; splits?: { displayName?: string; stats?: string[] }[] };
  awards?: { name?: string; displayCount?: string; seasons?: string[] }[];
}

export interface RawAthleteGamelog {
  labels?: string[];
  displayNames?: string[];
  events?: Record<
    string,
    {
      id?: string;
      gameDate?: string;
      atVs?: string;
      score?: string;
      gameResult?: string;
      opponent?: RawTeamRef;
    }
  >;
  seasonTypes?: {
    displayName?: string;
    categories?: { displayName?: string; type?: string; events?: { eventId?: string; stats?: string[] }[] }[];
  }[];
}

/* ------------------------------- Colonnes ------------------------------- */

const COLONNES: Record<string, [string, string]> = {
  GP: ["MJ", "Matchs joués"],
  GS: ["TIT", "Matchs commencés comme titulaire"],
  MIN: ["MIN", "Minutes"],
  PTS: ["PTS", "Points"],
  FG: ["TIRS", "Tirs réussis-tentés"],
  "FG%": ["%TIRS", "Réussite aux tirs"],
  "3PT": ["3PTS", "Tirs à 3 points réussis-tentés"],
  "3P%": ["%3PTS", "Réussite à 3 points"],
  FT: ["LF", "Lancers francs réussis-tentés"],
  "FT%": ["%LF", "Réussite aux lancers francs"],
  OR: ["RO", "Rebonds offensifs"],
  DR: ["RD", "Rebonds défensifs"],
  REB: ["REB", "Rebonds"],
  AST: ["PD", "Passes décisives"],
  BLK: ["CTR", "Contres"],
  STL: ["INT", "Interceptions"],
  PF: ["F", "Fautes personnelles"],
  TO: ["BP", "Balles perdues"],
  DD2: ["DD", "Doubles-doubles"],
  TD3: ["TD", "Triples-doubles"],
  DQ: ["EXCL", "Exclusions pour six fautes"],
  EJECT: ["EXP", "Expulsions"],
  TECH: ["TECH", "Fautes techniques"],
  FLAG: ["FLAG", "Fautes flagrantes"],
  "AST/TO": ["PD/BP", "Passes décisives par balle perdue"],
  "STL/TO": ["INT/BP", "Interceptions par balle perdue"],
  "SC-EFF": ["EFF-PTS", "Efficacité au scoring : points par tir tenté"],
  "SH-EFF": ["EFF-TIR", "Efficacité au tir"],
};

const colonnes = (labels: string[] = [], descriptions: string[] = []): StatColumn[] =>
  labels.map((l, i) => {
    const [abbr, title] = COLONNES[l] ?? [l, descriptions[i] ?? l];
    return { abbr, title };
  });

const TABLEAUX: Record<string, string> = {
  averages: "Moyennes par match",
  totals: "Totaux",
  miscellaneous: "Divers",
};

/* ------------------------------ Traductions ------------------------------ */

const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);

const POSTES: Record<string, string> = {
  "Point Guard": "Meneur",
  "Shooting Guard": "Arrière",
  Guard: "Arrière",
  "Small Forward": "Ailier",
  "Power Forward": "Ailier fort",
  Forward: "Ailier",
  Center: "Pivot",
  "Guard-Forward": "Arrière-ailier",
  "Forward-Center": "Ailier-pivot",
  "Forward-Guard": "Ailier-arrière",
  "Center-Forward": "Pivot-ailier",
};

/** « 6' 2" » → « 1,88 m ». */
function taille(display?: string): string | undefined {
  const m = display?.match(/(\d+)'\s*(\d+)?/);
  if (!m) return display;
  const cm = Math.round((Number(m[1]) * 12 + Number(m[2] ?? 0)) * 2.54);
  return `${(cm / 100).toFixed(2).replace(".", ",")} m (${display})`;
}

/** « 190 lbs » → « 86 kg ». */
function poids(display?: string): string | undefined {
  const m = display?.match(/(\d+)/);
  return m ? `${Math.round(Number(m[1]) * 0.4536)} kg (${display})` : display;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** ESPN écrit la date de naissance « 31/8/1996 » (jour/mois/année). */
function naissance(display?: string, age?: number): string | undefined {
  const m = display?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const date = m ? `${m[1] === "1" ? "1er" : m[1]} ${MOIS[Number(m[2]) - 1]} ${m[3]}` : display;
  if (!date) return age ? `${age} ans` : undefined;
  return age ? `${date} (${age} ans)` : date;
}

/** « 2018: Rd 2, Pk 33 (DAL) » → « 2018 · 2e tour, 33e choix (DAL) ». */
function draft(display?: string): string | undefined {
  const m = display?.match(/^(\d{4}): Rd (\d+), Pk (\d+)(?: \((\w+)\))?/);
  if (!m) return display;
  return `${m[1]} · ${ordinal(Number(m[2]))} tour, ${ordinal(Number(m[3]))} choix${m[4] ? ` (${m[4]})` : ""}`;
}

/** « 9th Season » → « 9e saison ». */
function experience(display?: string): string | undefined {
  const m = display?.match(/^(\d+)\w* Season/i);
  if (m) return `${ordinal(Number(m[1]))} saison`;
  return display?.toLowerCase().includes("rookie") ? "Rookie" : display;
}

/** Récompenses individuelles : les intitulés connus en français, les autres tels quels. */
function recompense(name: string): string {
  const equipe = name.match(/^All-(NBA|WNBA) (1st|2nd|3rd) Team$/);
  if (equipe) return `${equipe[2][0]}e équipe All-${equipe[1]}`.replace("1e", "1re");
  const def = name.match(/^(?:NBA |WNBA )?All-Defensive (1st|2nd) Team$/);
  if (def) return `${def[1][0]}e équipe défensive`.replace("1e", "1re");
  const rookie = name.match(/^(?:NBA |WNBA )?All-Rookie (1st|2nd) Team$/);
  if (rookie) return `${rookie[1][0]}e équipe des rookies`.replace("1e", "1re");
  const table: Record<string, string> = {
    "Finals MVP": "MVP des Finales",
    MVP: "MVP de la saison",
    "Most Valuable Player": "MVP de la saison",
    "NBA Most Valuable Player": "MVP de la saison",
    "WNBA Most Valuable Player": "MVP de la saison",
    "All-Star": "All-Star",
    "NBA All-Star": "All-Star",
    "WNBA All-Star": "All-Star",
    "All-Star MVP": "MVP du All-Star Game",
    "Rookie of the Year": "Rookie de l'année",
    "Defensive Player of the Year": "Défenseur de l'année",
    "Sixth Man of the Year": "Sixième homme de l'année",
    "Sixth Player of the Year": "Sixième joueuse de l'année",
    "Most Improved Player": "Meilleure progression",
    "Clutch Player of the Year": "Joueur décisif de l'année",
    "NBA Cup MVP": "MVP de la NBA Cup",
    "NBA Cup All-Tournament Team": "Équipe type de la NBA Cup",
    "All-WNBA 1st Team": "1re équipe All-WNBA",
    "WNBA Champion": "Champion WNBA",
    "NBA Champion": "Champion NBA",
    "NBA Eastern Conference Finals MVP": "MVP des finales de conférence Est",
    "NBA Western Conference Finals MVP": "MVP des finales de conférence Ouest",
    "Commissioner's Cup MVP": "MVP de la Commissioner's Cup",
    "Olympic Gold Medal": "Médaille d'or olympique",
  };
  return table[name] ?? name;
}

const ROUNDS: [RegExp, string][] = [
  [/NBA Finals/i, "Finale NBA"],
  [/WNBA Finals/i, "Finale WNBA"],
  [/Conference Finals/i, "Finale de conférence"],
  [/Conference Semifinals/i, "Demi-finale de conférence"],
  [/Conference Quarterfinals|First Round|1st Round/i, "1er tour"],
  [/Semifinals/i, "Demi-finale"],
  [/Play-?In/i, "Play-in"],
];
const tour = (s?: string) => ROUNDS.find(([r]) => r.test(s ?? ""))?.[1];

/** « 2025-26 Regular Season » → « Saison régulière 2025-26 ». */
function typeSaison(s?: string): string {
  const saison = s?.match(/\d{4}(?:-\d{2})?/)?.[0] ?? "";
  if (/post/i.test(s ?? "")) return `Playoffs ${saison}`.trim();
  if (/play-?in/i.test(s ?? "")) return `Play-in ${saison}`.trim();
  if (/preseason/i.test(s ?? "")) return `Présaison ${saison}`.trim();
  if (/regular/i.test(s ?? "")) return `Saison régulière ${saison}`.trim();
  return s ?? "";
}

const CHIFFRES: Record<string, string> = {
  avgPoints: "Points",
  avgRebounds: "Rebonds",
  avgAssists: "Passes décisives",
  fieldGoalPct: "% aux tirs",
  threePointFieldGoalPct: "% à 3 points",
  freeThrowPct: "% aux lancers francs",
  avgSteals: "Interceptions",
  avgBlocks: "Contres",
};

/* ------------------------------- Tableaux ------------------------------- */

function tableaux(raw: RawAthleteStats | null, league: LeagueId): CareerTable[] {
  const equipes = raw?.teams ?? {};
  const parId = new Map(Object.values(equipes).map((t) => [String(t.id), t]));
  return (raw?.categories ?? [])
    .filter((c) => c.statistics?.length)
    .map((c) => ({
      title: TABLEAUX[c.name ?? ""] ?? c.name ?? "",
      columns: colonnes(c.labels, c.displayNames),
      rows: [...(c.statistics ?? [])].reverse().map((r) => {
        const t = (r.teamSlug && equipes[r.teamSlug]) || parId.get(String(r.teamId));
        return {
          season: r.season?.displayName ?? "",
          team: t?.abbreviation
            ? { id: String(t.id), abbreviation: t.abbreviation, logo: espnLogo({ id: String(t.id), abbreviation: t.abbreviation }, league) }
            : undefined,
          stats: r.stats ?? [],
        };
      }),
      totals: c.totals ?? [],
    }));
}

function matchs(raw: RawAthleteGamelog | null, league: LeagueId): PlayerProfile["gameLog"] {
  if (!raw?.events) return [];
  const columns = colonnes(raw.labels, raw.displayNames);
  return (raw.seasonTypes ?? [])
    .map((st) => {
      const games: PlayerGame[] = [];
      for (const cat of st.categories ?? []) {
        if (cat.type !== "event") continue;
        for (const e of cat.events ?? []) {
          const ev = raw.events?.[e.eventId ?? ""];
          if (!ev?.opponent) continue;
          games.push({
            id: String(ev.id ?? e.eventId),
            date: ev.gameDate ?? "",
            home: ev.atVs === "vs",
            opponent: {
              id: String(ev.opponent.id ?? ""),
              abbreviation: ev.opponent.abbreviation ?? "",
              name: ev.opponent.displayName ?? "",
              logo: espnLogo({ ...ev.opponent, id: String(ev.opponent.id ?? "") }, league),
            },
            result: ev.gameResult === "W" ? "V" : ev.gameResult === "L" ? "D" : undefined,
            score: ev.score ?? "",
            stats: e.stats ?? [],
            round: tour(cat.displayName),
          });
        }
      }
      games.sort((a, b) => b.date.localeCompare(a.date));
      return { title: typeSaison(st.displayName), columns, games };
    })
    .filter((s) => s.games.length);
}

/* --------------------------------- Fiche --------------------------------- */

export function normalizePlayer(
  league: LeagueId,
  id: string,
  bio: RawAthleteBio,
  regular: RawAthleteStats | null,
  playoffs: RawAthleteStats | null,
  overview: RawAthleteOverview | null,
  gamelog: RawAthleteGamelog | null,
): PlayerProfile {
  const a = bio.athlete ?? {};
  const poste = a.position?.displayName;
  const lignes: [string, string | undefined][] = [
    ["Naissance", naissance(a.displayDOB, a.age)],
    ["Lieu de naissance", a.displayBirthPlace],
    ["Taille", taille(a.displayHeight)],
    ["Poids", poids(a.displayWeight)],
    ["Université", a.college?.name],
    ["Draft", draft(a.displayDraft)],
    ["Expérience", experience(a.displayExperience)],
    ["Débuts", a.debutYear ? String(a.debutYear) : undefined],
  ];

  const resume = a.statsSummary;
  const ov = overview?.statistics;

  return {
    league,
    id,
    name: a.displayName ?? "",
    jersey: a.displayJersey ?? (a.jersey ? `#${a.jersey}` : undefined),
    position: poste ? (POSTES[poste] ?? poste) : a.position?.abbreviation,
    headshot: a.headshot?.href,
    active: a.active !== false,
    team: a.team?.id
      ? {
          id: String(a.team.id),
          name: a.team.displayName ?? "",
          logo: espnLogo({ ...a.team, id: String(a.team.id) }, league),
          color: a.team.color ? `#${a.team.color}` : undefined,
        }
      : undefined,
    bio: lignes.filter((l): l is [string, string] => Boolean(l[1])).map(([label, value]) => ({ label, value })),
    highlightsLabel: resume?.displayName ? typeSaison(resume.displayName) : undefined,
    highlights: (resume?.statistics ?? []).map((s) => {
      const rang = Number(s.rankDisplayValue?.match(/\d+/)?.[0]);
      return {
        label: CHIFFRES[s.name ?? ""] ?? s.displayName ?? "",
        value: s.displayValue ?? "",
        rank: rang ? `${ordinal(rang)} de la ligue` : undefined,
      };
    }),
    splits: ov?.splits?.length
      ? {
          columns: colonnes(ov.labels, ov.displayNames),
          rows: ov.splits.map((sp) => ({
            label:
              sp.displayName === "Regular Season"
                ? "Saison régulière"
                : sp.displayName === "Postseason"
                  ? "Playoffs"
                  : sp.displayName === "Career"
                    ? "Carrière"
                    : (sp.displayName ?? ""),
            stats: sp.stats ?? [],
          })),
        }
      : undefined,
    awards: (overview?.awards ?? []).map((w) => ({
      name: recompense(w.name ?? ""),
      count: Number(w.displayCount?.match(/\d+/)?.[0] ?? w.seasons?.length ?? 1),
      seasons: w.seasons ?? [],
    })),
    career: tableaux(regular, league),
    playoffs: tableaux(playoffs, league),
    gameLog: matchs(gamelog, league),
  };
}
