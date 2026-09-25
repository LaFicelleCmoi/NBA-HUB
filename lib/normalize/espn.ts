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
  TeamStatGroup,
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
  franchise?: {
    venue?: { fullName?: string; address?: { city?: string; state?: string } };
  };
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
  // Le scoreboard donne `value`, le résumé d'un match seulement `displayValue`.
  linescores?: { value?: number; displayValue?: string }[];
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
    periods: (c?.linescores ?? []).map((l) => Number(l.value ?? l.displayValue ?? 0)),
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

/**
 * Bilans et moyennes détaillés d'une ligne de classement. ESPN nomme ces
 * entrées en anglais et en clair (« vs. Conf. », « Last Ten Games ») : on les
 * traduit ici, dans l'ordre d'affichage voulu.
 */
const ROW_DETAIL: [string, string, ("streak" | "pct")?][] = [
  ["overall", "Bilan général"],
  ["Home", "À domicile"],
  ["Road", "À l'extérieur"],
  ["vs. Conf.", "Dans la conférence"],
  ["vs. Div.", "Dans la division"],
  ["Last Ten Games", "10 derniers matchs"],
  ["streak", "Série en cours", "streak"],
  ["avgPointsFor", "Points marqués / match"],
  ["avgPointsAgainst", "Points encaissés / match"],
  ["differential", "Différence / match"],
  ["pointDifferential", "Différence totale"],
  ["pointsFor", "Points marqués"],
  ["pointsAgainst", "Points encaissés"],
  ["gamesBehind", "Matchs de retard"],
  ["winPercent", "% de victoires", "pct"],
  ["leagueWinPercent", "% de victoires (ligue)", "pct"],
  ["divisionWinPercent", "% de victoires (division)", "pct"],
];

function rowDetail(m: Map<string, { value?: number; displayValue?: string }>): TeamStat[] {
  const out: TeamStat[] = [];
  for (const [key, label, format] of ROW_DETAIL) {
    const entry = m.get(key);
    const raw = entry?.displayValue;
    // ESPN met « - » quand la valeur n'a pas de sens (aucun retard, par exemple).
    if (!raw || raw === "-") continue;
    if (format === "streak") {
      // « W3 » / « L1 » → « 3 victoires » / « 1 défaite ».
      const n = Number(raw.slice(1)) || 0;
      const win = raw.startsWith("W");
      out.push({ label, value: `${n} ${win ? "victoire" : "défaite"}${n > 1 ? "s" : ""}` });
    } else if (format === "pct") {
      // ESPN livre un ratio (« .561 », « 0.519 ») sous un libellé en pourcentage.
      const n = entry?.value ?? Number(raw);
      out.push({ label, value: Number.isFinite(n) ? `${(n * 100).toFixed(1)} %` : raw });
    } else {
      out.push({ label, value: raw });
    }
  }
  return out;
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
        pointsFor: Number(s.get("pointsFor")?.value ?? 0),
        pointsAgainst: Number(s.get("pointsAgainst")?.value ?? 0),
        streak: s.get("streak")?.displayValue?.replace(/^W/, "V").replace(/^L/, "D"),
        seed: Number(s.get("playoffSeed")?.value ?? 0),
        detail: rowDetail(s),
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
    birthPlace?: { city?: string; state?: string; country?: string };
    college?: { name?: string; shortName?: string };
    experience?: { years?: number };
    status?: { name?: string; type?: string };
    injuries?: { status?: string; details?: { type?: string } }[];
    contract?: { salary?: number };
  }[];
  coach?: { firstName?: string; lastName?: string }[];
}

/** Statuts de joueur renvoyés par ESPN, en français. */
const PLAYER_STATUS_FR: Record<string, string> = {
  active: "Actif",
  injured: "Blessé",
  "day-to-day": "Incertain",
  out: "Forfait",
  suspension: "Suspendu",
  inactive: "Inactif",
};

/** Statuts de blessure renvoyés par ESPN (`injuries[].status`), en français. */
const INJURY_FR: Record<string, string> = {
  "day-to-day": "Incertain",
  out: "Forfait",
  doubtful: "Très incertain",
  questionable: "Incertain",
  probable: "Probable",
  "out for season": "Forfait saison",
  suspension: "Suspendu",
};

const frInjury = (v?: string) => (v ? (INJURY_FR[v.toLowerCase()] ?? v) : undefined);

export function normalizeRoster(raw: RawEspnRoster): { roster: Player[]; coach?: string } {
  const roster: Player[] = (raw.athletes ?? []).map((a) => {
    const injury = a.injuries?.[0];
    const place = [a.birthPlace?.city, a.birthPlace?.state, a.birthPlace?.country].filter(Boolean).join(", ");
    return {
      id: a.id,
      name: a.displayName,
      jersey: a.jersey,
      position: a.position?.abbreviation,
      height: a.height ? `${Math.round(a.height * 2.54)} cm` : a.displayHeight,
      weight: a.weight ? `${Math.round(a.weight * 0.4536)} kg` : a.displayWeight,
      age: a.age,
      country: a.birthPlace?.country,
      headshot: a.headshot?.href,
      birthPlace: place || undefined,
      experience: a.experience?.years,
      college: a.college?.name ?? a.college?.shortName,
      status: a.status?.type ? (PLAYER_STATUS_FR[a.status.type] ?? a.status.name) : undefined,
      injury: frInjury(injury?.details?.type ?? injury?.status),
      salary: a.contract?.salary || undefined,
    };
  });
  // Les numéros sont des chaînes (« 00 », « 7 ») : tri numérique, sans numéro en dernier.
  const num = (j?: string) => (j === undefined || j === "" ? Number.POSITIVE_INFINITY : Number(j));
  roster.sort((a, b) => num(a.jersey) - num(b.jersey) || a.name.localeCompare(b.name, "fr"));
  const c = raw.coach?.[0];
  return { roster, coach: c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : undefined };
}

/* --------------------------- Statistiques équipe -------------------------- */

export interface RawEspnTeamStats {
  results?: {
    stats?: { categories?: { name?: string; stats?: { name: string; displayValue?: string }[] }[] };
  };
}

/**
 * Toutes les statistiques d'équipe publiées par ESPN, traduites et rangées
 * par thème. L'ordre de ce tableau est celui de l'affichage ; `pct` ajoute
 * le signe « % » à la valeur.
 */
const TEAM_STAT_GROUPS: { label: string; stats: [string, string, boolean?][] }[] = [
  {
    label: "Général",
    stats: [
      ["gamesPlayed", "Matchs joués"],
      ["avgPoints", "Points / match"],
      ["avgRebounds", "Rebonds / match"],
      ["avgAssists", "Passes / match"],
      ["avgTurnovers", "Balles perdues / match"],
      ["avgFouls", "Fautes / match"],
      ["assistTurnoverRatio", "Passes par balle perdue"],
    ],
  },
  {
    label: "Attaque",
    stats: [
      ["fieldGoalPct", "% aux tirs", true],
      ["avgFieldGoalsMade", "Tirs réussis / match"],
      ["avgFieldGoalsAttempted", "Tirs tentés / match"],
      ["twoPointFieldGoalPct", "% à 2 points", true],
      ["avgTwoPointFieldGoalsMade", "Tirs à 2 pts réussis / match"],
      ["avgTwoPointFieldGoalsAttempted", "Tirs à 2 pts tentés / match"],
      ["threePointFieldGoalPct", "% à 3 points", true],
      ["avgThreePointFieldGoalsMade", "Tirs à 3 pts réussis / match"],
      ["avgThreePointFieldGoalsAttempted", "Tirs à 3 pts tentés / match"],
      ["freeThrowPct", "% aux lancers francs", true],
      ["avgFreeThrowsMade", "Lancers francs réussis / match"],
      ["avgFreeThrowsAttempted", "Lancers francs tentés / match"],
      ["avgOffensiveRebounds", "Rebonds offensifs / match"],
      ["scoringEfficiency", "Efficacité au scoring"],
      ["shootingEfficiency", "Efficacité au tir"],
    ],
  },
  {
    label: "Défense",
    stats: [
      ["avgDefensiveRebounds", "Rebonds défensifs / match"],
      ["avgSteals", "Interceptions / match"],
      ["avgBlocks", "Contres / match"],
    ],
  },
  {
    label: "Totaux de la saison",
    stats: [
      ["points", "Points marqués"],
      ["rebounds", "Rebonds"],
      ["offensiveRebounds", "Rebonds offensifs"],
      ["defensiveRebounds", "Rebonds défensifs"],
      ["assists", "Passes décisives"],
      ["steals", "Interceptions"],
      ["blocks", "Contres"],
      ["turnovers", "Balles perdues"],
      ["fieldGoalsMade", "Tirs réussis"],
      ["fieldGoalsAttempted", "Tirs tentés"],
      ["twoPointFieldGoalsMade", "Tirs à 2 pts réussis"],
      ["twoPointFieldGoalsAttempted", "Tirs à 2 pts tentés"],
      ["threePointFieldGoalsMade", "Tirs à 3 pts réussis"],
      ["threePointFieldGoalsAttempted", "Tirs à 3 pts tentés"],
      ["freeThrowsMade", "Lancers francs réussis"],
      ["freeThrowsAttempted", "Lancers francs tentés"],
    ],
  },
];

/**
 * ESPN renvoie ces champs au niveau de l'équipe mais ne les alimente jamais
 * (toujours 0) : les afficher laisserait croire à une saison sans minutes
 * jouée. `totalRebounds` et `threePointPct` sont par ailleurs des doublons
 * exacts de `rebounds` et `threePointFieldGoalPct`.
 */
const TEAM_STATS_IGNORED = new Set(["gamesStarted", "minutes", "avgMinutes", "totalRebounds", "threePointPct"]);

export function normalizeTeamStats(raw: RawEspnTeamStats): TeamStatGroup[] {
  const all = new Map<string, string>();
  for (const c of raw.results?.stats?.categories ?? [])
    for (const s of c.stats ?? [])
      if (!all.has(s.name) && s.displayValue && !TEAM_STATS_IGNORED.has(s.name)) all.set(s.name, s.displayValue);

  const groups = TEAM_STAT_GROUPS.map((g) => ({
    label: g.label,
    stats: g.stats
      .filter(([key]) => all.has(key))
      .map(([key, label, pct]) => {
        const raw = all.get(key)!;
        if (pct) return { label, value: `${raw} %` };
        // ESPN renvoie certains totaux en décimal (« 2374.0 ») : ce sont des entiers.
        return { label, value: g.label === "Totaux de la saison" ? raw.replace(/\.0$/, "") : raw };
      }),
  })).filter((g) => g.stats.length > 0);

  // Filet de sécurité : si ESPN ajoute une statistique, elle apparaît quand
  // même plutôt que d'être silencieusement perdue.
  const known = new Set(TEAM_STAT_GROUPS.flatMap((g) => g.stats.map(([k]) => k)));
  const extra = [...all.entries()].filter(([k]) => !known.has(k)).map(([k, v]) => ({ label: k, value: v }));
  if (extra.length) groups.push({ label: "Autres", stats: extra });
  return groups;
}
