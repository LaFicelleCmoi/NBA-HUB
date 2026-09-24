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
  euroleagueApi: str("EUROLEAGUE_API", "https://api-live.euroleague.net"),
  euroleagueLiveApi: str("EUROLEAGUE_LIVE_API", "https://live.euroleague.net/api"),
  euroleagueCompetition: str("EUROLEAGUE_COMPETITION", "E"),
  // 12 s : le premier appel à ESPN après un démarrage à froid dépasse
  // régulièrement 8 s, et tout le monde n'a pas une liaison rapide.
  upstreamTimeoutMs: int("UPSTREAM_TIMEOUT_MS", 12000),
  // Flux RSS d'actualités (français en priorité, anglais en complément)
  // BasketUSA publie un fil unique : les articles sont triés NBA / WNBA par leur rubrique.
  newsBasketUsa: exact("NEWS_BASKETUSA_RSS", "https://www.basketusa.com/feed/"),
  newsEuroleagueFr: exact("NEWS_EUROLEAGUE_FR_RSS", "https://www.basketeurope.com/category/euroleague/feed/"),
  newsEuroleagueEn: exact("NEWS_EUROLEAGUE_EN_RSS", "https://www.eurohoops.net/en/category/euroleague/feed/"),
} as const;

/**
 * Trace des bases réellement utilisées, écrite une fois au démarrage du
 * serveur. Une variable d'environnement mal renseignée en production écrase
 * silencieusement la valeur par défaut et ne casse qu'un fournisseur : sans
 * cette ligne, le symptôme (une ligue vide) ne désigne pas sa cause.
 * Rien de sensible ici — ce sont des API publiques, et ce journal reste côté
 * serveur.
 */
const OVERRIDDEN = ["ESPN_SITE_API", "ESPN_STANDINGS_API", "ESPN_WEB_API", "EUROLEAGUE_API", "EUROLEAGUE_LIVE_API"]
  .filter((n) => process.env[n]?.trim());
console.info(
  "[config] bases amont :",
  { espn: env.espnSiteApi, classements: env.espnStandingsApi, leaders: env.espnWebApi, euroleague: env.euroleagueApi },
  OVERRIDDEN.length ? `— redéfinies par l'environnement : ${OVERRIDDEN.join(", ")}` : "— valeurs par défaut",
);

/** Durées de cache (secondes). */
export const REVALIDATE = {
  live: 30,
  /**
   * Fraîcheur annoncée au CDN pour les scores. Court exprès : ESPN lui-même
   * n'autorise que 10 s, tout ce qu'on ajoute ici devient du retard visible.
   */
  liveCdn: 5,
  standings: 600,
  news: 600,
  schedule: 600,
  leaders: 3600,
  roster: 3600,
  teams: 3600,
} as const;
