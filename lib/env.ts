import "server-only";

/**
 * Configuration serveur. Toutes les URL d'API tierces sont lues ici
 * (avec des valeurs par défaut publiques) et ne sont jamais exposées au client.
 */
function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim().replace(/\/+$/, "") : fallback;
}

/** URL conservée telle quelle (les flux RSS WordPress exigent le « / » final). */
function exact(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function int(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const env = {
  espnSiteApi: str("ESPN_SITE_API", "https://site.api.espn.com/apis/site/v2/sports/basketball"),
  espnStandingsApi: str("ESPN_STANDINGS_API", "https://site.api.espn.com/apis/v2/sports/basketball"),
  espnWebApi: str("ESPN_WEB_API", "https://site.web.api.espn.com/apis/site/v3/sports/basketball"),
  upstreamTimeoutMs: int("UPSTREAM_TIMEOUT_MS", 8000),
  // Flux RSS d'actualités. BasketUSA publie un fil unique : les articles sont
  // triés NBA / WNBA par leur rubrique.
  newsBasketUsa: exact("NEWS_BASKETUSA_RSS", "https://www.basketusa.com/feed/"),
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
