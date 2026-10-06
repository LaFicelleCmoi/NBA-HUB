/**
 * Modèle de données commun à toutes les ligues.
 * Tout ce qui sort de lib/normalize respecte ces types : les composants
 * n'ont jamais à connaître la forme des réponses ESPN ou EuroLeague.
 */

export type LeagueId = "nba" | "wnba" | "euroleague";

export interface League {
  id: LeagueId;
  name: string;
  shortName: string;
  region: string;
  /** Nom des conférences (NBA/WNBA) ; vide pour un tableau unique. */
  conferences: string[];
  logo: Logo;
  accent: string;
}

export interface Logo {
  light: string;
  dark: string;
}

export interface Team {
  id: string;
  league: LeagueId;
  name: string;
  shortName: string;
  abbreviation: string;
  logo: Logo;
  color?: string;
  location?: string;
  conference?: string;
}

export type GameStatus = "scheduled" | "live" | "final" | "postponed";

export interface GameTeam {
  team: Team;
  score: number | null;
  /** Scores par période : 4 quarts-temps puis prolongations éventuelles. */
  periods: number[];
  winner: boolean;
  record?: string;
  isHome: boolean;
}

export interface Game {
  id: string;
  league: LeagueId;
  /** ISO 8601 UTC */
  date: string;
  status: GameStatus;
  /** Libellé brut du statut (ex. « Q3 5:12 », « Final/OT »). */
  statusDetail: string;
  period?: number;
  clock?: string;
  home: GameTeam;
  away: GameTeam;
  venue?: string;
  phase?: string;
  round?: string;
}

export interface StandingRow {
  team: Team;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  winPct: number;
  diff: number;
  /** Points marqués et encaissés sur la saison. */
  pointsFor?: number;
  pointsAgainst?: number;
  streak?: string;
  /** Rang utilisé pour les zones de qualification (ligue entière pour la WNBA). */
  seed: number;
  /**
   * Bilans détaillés fournis par ESPN (domicile, extérieur, conférence,
   * division, 10 derniers matchs, moyennes de points…). Absent pour
   * l'EuroLeague, dont l'API ne les expose pas.
   */
  detail?: TeamStat[];
  /**
   * Match en cours de cette équipe, intégré au classement provisoire :
   * score actuel, adversaire, minute, et si elle mène.
   */
  liveGame?: { score: string; opponent: string; opponentLogo: Logo; detail: string; winning: boolean };
  /** Places gagnées (+) ou perdues (−) par rapport au classement officiel. */
  movement?: number;
}

export interface StandingGroup {
  name: string;
  rows: StandingRow[];
}

export interface Standings {
  league: LeagueId;
  season: string;
  /** true si la saison en cours n'a pas commencé et que l'on affiche la précédente. */
  isPreviousSeason: boolean;
  groups: StandingGroup[];
  totals: { games: number; points: number };
}

export type LeaderCategory = "points" | "rebounds" | "assists" | "steals" | "blocks";

export interface LeaderEntry {
  rank: number;
  playerId: string;
  name: string;
  headshot?: string;
  team?: Team;
  value: number;
  displayValue: string;
  gamesPlayed?: number;
}

export interface Leader {
  category: LeaderCategory;
  label: string;
  entries: LeaderEntry[];
}

export interface LeadersResponse {
  league: LeagueId;
  season: string;
  leaders: Leader[];
}

export interface Player {
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  height?: string;
  weight?: string;
  age?: number;
  country?: string;
  headshot?: string;
  /** Lieu de naissance complet (« Toronto, Canada »). */
  birthPlace?: string;
  /** Années d'expérience professionnelle. */
  experience?: number;
  college?: string;
  /** Statut sportif (« Actif », « Blessé »…). */
  status?: string;
  /** Description de la blessure en cours, le cas échéant. */
  injury?: string;
  /** Salaire annuel en dollars (NBA uniquement). */
  salary?: number;
}

export interface TeamStat {
  label: string;
  value: string;
}

/** Statistiques regroupées par thème (Général, Attaque, Défense, Totaux). */
export interface TeamStatGroup {
  label: string;
  stats: TeamStat[];
}

export interface TeamDetail {
  team: Team;
  season: string;
  standingSummary?: string;
  coach?: string;
  /** Salle du club, quand l'API la fournit. */
  venue?: string;
  /** Bilans détaillés : général, domicile, extérieur, conférence, 10 derniers… */
  records: TeamStat[];
  roster: Player[];
  recent: Game[];
  upcoming: Game[];
  stats: TeamStatGroup[];
}

/** Une série de phase finale : deux équipes, un vainqueur au meilleur des N. */
export interface PlayoffSeries {
  id: string;
  /** Tableau ou affiche : « Est », « Ouest », « 7e contre 8e »… */
  label?: string;
  /** Équipes, ou `null` quand l'affiche n'est pas encore connue. */
  teams: [Team | null, Team | null];
  wins: [number, number];
  /** Au meilleur des N matchs ; 1 pour un match sec. */
  bestOf: number;
  /** Identifiant du vainqueur, une fois la série décidée. */
  winner?: string;
  /** À venir, commencée entre deux matchs, match en cours, ou décidée. */
  status: "scheduled" | "ongoing" | "live" | "final";
  games: Game[];
}

export interface PlayoffRound {
  name: string;
  series: PlayoffSeries[];
}

export interface Playoffs {
  league: LeagueId;
  season: string;
  rounds: PlayoffRound[];
  champion?: Team;
  /** Précision affichée au-dessus du tableau (phase finale en cours, à venir…). */
  note?: string;
}

/** Une action du play-by-play, déjà traduite. */
export interface Play {
  id: string;
  /** 1 à 4, puis 5 et au-delà pour les prolongations. */
  period: number;
  /** Temps restant dans la période, « 08:21 ». */
  clock: string;
  text: string;
  /** Équipe à l'origine de l'action, quand elle est connue. */
  teamId?: string;
  /** Score après l'action. */
  home: number;
  away: number;
  /** Panier marqué : mis en évidence et filtrable. */
  scoring: boolean;
  points?: number;
}

/** Colonne d'un tableau de statistiques : abréviation affichée et intitulé complet. */
export interface StatColumn {
  abbr: string;
  title: string;
}

/** Un tableau de carrière (moyennes, totaux ou divers), une ligne par saison. */
export interface CareerTable {
  title: string;
  columns: StatColumn[];
  rows: { season: string; team?: { id: string; abbreviation: string; logo: Logo }; stats: string[] }[];
  /** Ligne « Carrière ». */
  totals: string[];
}

/** Un match du joueur dans la saison en cours. */
export interface PlayerGame {
  id: string;
  date: string;
  home: boolean;
  opponent: { id: string; abbreviation: string; name: string; logo: Logo };
  result?: "V" | "D";
  /** Score du match, équipe du joueur en premier (« 119-111 »). */
  score: string;
  stats: string[];
  /** Tour de playoffs, quand le match en est un. */
  round?: string;
}

/**
 * Fiche d'un joueur : identité, palmarès individuel, statistiques de la
 * saison, de toute la carrière (saison régulière et playoffs) et match par
 * match pour la saison en cours.
 */
export interface PlayerProfile {
  league: LeagueId;
  id: string;
  name: string;
  jersey?: string;
  position?: string;
  headshot?: string;
  active: boolean;
  team?: { id: string; name: string; logo: Logo; color?: string };
  bio: { label: string; value: string }[];
  /** Intitulé des chiffres clés (« Saison régulière 2025-26 »). */
  highlightsLabel?: string;
  highlights: { label: string; value: string; rank?: string }[];
  /** Saison, playoffs et carrière côte à côte. */
  splits?: { columns: StatColumn[]; rows: { label: string; stats: string[] }[] };
  awards: { name: string; count: number; seasons: string[] }[];
  career: CareerTable[];
  playoffs: CareerTable[];
  gameLog: { title: string; columns: StatColumn[]; games: PlayerGame[] }[];
}

/** Une ligne de la feuille de match : un joueur et ses statistiques. */
export interface BoxPlayer {
  id: string;
  name: string;
  shortName: string;
  jersey?: string;
  position?: string;
  headshot?: string;
  /** Dans le cinq de départ. */
  starter: boolean;
  /** Motif d'absence du match (« Choix de l'entraîneur »…), s'il n'a pas joué. */
  dnp?: string;
  ejected?: boolean;
  /** Valeurs dans l'ordre des colonnes de la feuille. */
  stats: string[];
}

/** Feuille de match d'une équipe : titulaires, remplaçants, totaux. */
export interface BoxTeam {
  teamId: string;
  players: BoxPlayer[];
  totals: string[];
}

export interface Boxscore {
  /** Colonnes communes aux deux équipes : abréviation et intitulé complet. */
  columns: { abbr: string; title: string }[];
  teams: BoxTeam[];
}

/** Une ligne du comparatif des deux équipes. */
export interface TeamComparison {
  label: string;
  away: string;
  home: string;
  /** Valeurs numériques, pour la barre de comparaison. */
  awayValue?: number;
  homeValue?: number;
  /** Faux quand la plus petite valeur est la meilleure (balles perdues…). */
  higherIsBetter: boolean;
}

/** Meilleur joueur d'une équipe dans une catégorie (points, rebonds, passes). */
export interface GameLeader {
  category: string;
  teamId: string;
  player: { id: string; name: string; headshot?: string; position?: string; jersey?: string };
  value: string;
  /** Ligne complète du joueur (« 9/20 tirs, 3/7 à 3 pts »), quand ESPN la donne. */
  line?: string;
}

export interface GameInjury {
  teamId: string;
  player: string;
  headshot?: string;
  status: string;
  detail?: string;
  /** Date de retour estimée (ISO). */
  returnDate?: string;
}

/** Série de confrontations entre les deux équipes (saison régulière ou playoffs). */
export interface HeadToHead {
  title: string;
  /** Victoires de chaque équipe, par identifiant. */
  wins: Record<string, number>;
  games: { id: string; date: string; status: GameStatus; scores: Record<string, number | null> }[];
}

export interface GameVideo {
  id: string;
  title: string;
  thumbnail?: string;
  url: string;
  /** Durée en secondes. */
  duration?: number;
}

/** Un point de la courbe de probabilité de victoire. */
export interface WinProbabilityPoint {
  /** Secondes de jeu écoulées depuis l'entre-deux initial. */
  elapsed: number;
  /** Probabilité de victoire de l'équipe à domicile, de 0 à 1. */
  home: number;
  period: number;
  clock: string;
}

export interface GameInfo {
  venue?: string;
  city?: string;
  attendance?: number;
  officials: string[];
  broadcasts: string[];
}

/**
 * Page d'un match : l'en-tête, le déroulé complet dans l'ordre chronologique,
 * et tout ce que le fournisseur publie autour — feuille de match, comparatif,
 * meilleurs joueurs, probabilité de victoire, infos, blessés, confrontations,
 * vidéos. Ces compléments sont optionnels : l'EuroLeague n'en fournit pas.
 */
export interface GameDetail {
  game: Game;
  plays: Play[];
  boxscore?: Boxscore;
  comparison?: TeamComparison[];
  leaders?: GameLeader[];
  winProbability?: WinProbabilityPoint[];
  /** Durée réglementaire d'un match en secondes, pour l'axe de la courbe. */
  regulationSeconds?: number;
  info?: GameInfo;
  injuries?: GameInjury[];
  headToHead?: HeadToHead[];
  videos?: GameVideo[];
}

/**
 * Vue condensée d'une équipe pour la carte « Mon équipe » de l'accueil :
 * juste de quoi la situer, sans charger la fiche complète.
 */
export interface TeamSummary {
  team: Team;
  /** Rang dans sa conférence (ou au classement pour l'EuroLeague). */
  rank?: number;
  /** Nombre d'équipes du même groupe, pour lire le rang (« 2e sur 15 »). */
  groupSize?: number;
  groupName?: string;
  wins?: number;
  losses?: number;
  played?: number;
  /** Saison du classement, et si c'est celle d'avant. */
  season?: string;
  isPreviousSeason?: boolean;
  /** Cinq derniers matchs joués, du plus récent au plus ancien. */
  recent: Game[];
  next?: Game;
}

export interface NewsItem {
  id: string;
  title: string;
  description?: string;
  published: string;
  image?: string;
  url: string;
  /** Média d'origine (ESPN, BasketUSA…) */
  source: string;
  lang: "fr" | "en";
}

export interface TodayLeague {
  league: LeagueId;
  games: Game[];
  nextGame?: Game;
  /** Dernière journée jouée (affichée quand il n'y a pas de match aujourd'hui). */
  lastGames?: Game[];
  /** Prochaine journée programmée. */
  nextGames?: Game[];
}

export interface TodayResponse {
  date: string;
  leagues: TodayLeague[];
  stats: {
    leagues: number;
    teams: number;
    gamesToday: number;
    pointsToday: number;
    seasonPoints: number;
    seasonGames: number;
    avgPerGame: number;
  };
}

export interface GamesResponse {
  league: LeagueId;
  view: "results" | "upcoming";
  games: Game[];
  /** Renseigné si les résultats proviennent de la saison précédente. */
  note?: string;
}

export interface FavoriteTeam {
  league: LeagueId;
  id: string;
  name: string;
  logo: Logo;
}
