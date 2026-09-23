import type { League, LeagueId } from "@/types";

export const LEAGUE_IDS = ["nba", "wnba", "euroleague"] as const satisfies readonly LeagueId[];

export const LEAGUES: Record<LeagueId, League> = {
  nba: {
    id: "nba",
    name: "NBA",
    shortName: "NBA",
    region: "États-Unis · Canada",
    conferences: ["Est", "Ouest"],
    logo: {
      light: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
      dark: "https://a.espncdn.com/i/teamlogos/leagues/500-dark/nba.png",
    },
    accent: "nba",
  },
  wnba: {
    id: "wnba",
    name: "WNBA",
    shortName: "WNBA",
    region: "États-Unis · Canada",
    conferences: ["Est", "Ouest"],
    logo: {
      light: "https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png",
      dark: "https://a.espncdn.com/i/teamlogos/leagues/500-dark/wnba.png",
    },
    accent: "wnba",
  },
  euroleague: {
    id: "euroleague",
    name: "EuroLeague",
    shortName: "EL",
    region: "Europe",
    conferences: [],
    logo: { light: "/leagues/euroleague.svg", dark: "/leagues/euroleague-dark.svg" },
    accent: "euroleague",
  },
};

export function isLeagueId(value: unknown): value is LeagueId {
  return typeof value === "string" && (LEAGUE_IDS as readonly string[]).includes(value);
}

/** Zones de qualification par ligue, basées sur le « seed ». */
export const ZONES: Record<LeagueId, { label: string; from: number; to: number; tone: "direct" | "playin" }[]> = {
  nba: [
    { label: "Qualifié playoffs", from: 1, to: 6, tone: "direct" },
    { label: "Play-in", from: 7, to: 10, tone: "playin" },
  ],
  wnba: [{ label: "Playoffs (top 8 de la ligue)", from: 1, to: 8, tone: "direct" }],
  euroleague: [
    { label: "Qualifié playoffs", from: 1, to: 6, tone: "direct" },
    { label: "Play-in", from: 7, to: 10, tone: "playin" },
  ],
};

export function zoneFor(league: LeagueId, seed: number) {
  return ZONES[league].find((z) => seed >= z.from && seed <= z.to);
}
