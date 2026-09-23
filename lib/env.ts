import "server-only";

/**
 * Configuration serveur. Toutes les URL d'API tierces sont lues ici
 * (avec des valeurs par défaut publiques) et ne sont jamais exposées au client.
 */
function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/+$/, "") : fallback;
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  espnSiteApi: str("ESPN_SITE_API", "https://site.api.espn.com/apis/site/v2/sports/basketball"),
  espnStandingsApi: str("ESPN_STANDINGS_API", "https://site.api.espn.com/apis/v2/sports/basketball"),
  espnWebApi: str("ESPN_WEB_API", "https://site.web.api.espn.com/apis/site/v3/sports/basketball"),
  euroleagueApi: str("EUROLEAGUE_API", "https://api-live.euroleague.net"),
  euroleagueLiveApi: str("EUROLEAGUE_LIVE_API", "https://live.euroleague.net/api"),
  euroleagueCompetition: str("EUROLEAGUE_COMPETITION", "E"),
  upstreamTimeoutMs: int("UPSTREAM_TIMEOUT_MS", 8000),
} as const;

/** Durées de cache (secondes). */
export const REVALIDATE = {
  live: 30,
  standings: 600,
  news: 600,
  schedule: 600,
  leaders: 3600,
  roster: 3600,
  teams: 3600,
} as const;
