/**
 * Origines des images du site, en un seul endroit : la CSP (`proxy.ts`) les
 * autorise, le loader d'images (`lib/image-loader.ts`) les sert directement.
 *
 * Les images ne passent plus par l'optimiseur de Vercel : sur l'offre
 * gratuite, ses 5 000 transformations mensuelles étaient épuisées — chaque
 * logo, en clair et en sombre, à chaque taille, et chaque photo de joueur en
 * consommait une.
 */
export const IMAGE_ORIGINS = [
  // Logos, photos de joueurs, ligues — redimensionnés par ESPN lui-même
  "https://a.espncdn.com",
  // Miniatures des vidéos de match ESPN
  "https://espnmedia-cdn.akamaized.net",
  // Logos et photos EuroLeague
  "https://media-cdn.incrowdsports.com",
  "https://media-cdn.cortextech.io",
  // Images des actualités (liste identique à IMAGE_HOSTS dans lib/api/rss.ts)
  "https://storage.ghost.io",
  "https://www.basketusa.com",
] as const;
