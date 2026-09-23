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
  streak?: string;
  /** Rang utilisé pour les zones de qualification (ligue entière pour la WNBA). */
  seed: number;
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
}

export interface TeamStat {
  label: string;
  value: string;
}

export interface TeamDetail {
  team: Team;
  season: string;
  standingSummary?: string;
  coach?: string;
  roster: Player[];
  recent: Game[];
  upcoming: Game[];
  stats: TeamStat[];
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
