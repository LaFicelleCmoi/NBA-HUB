"use client";

/**
 * Loader de `next/image` : les images sont servies par leur propre CDN, sans
 * passer par l'optimiseur de Vercel (quota de transformations épuisé, voir
 * `lib/image-hosts.ts`).
 *
 * ESPN redimensionne gratuitement ses images via son « combiner » : un logo
 * de 500 px (98 Ko) arrive en 64 px (4 Ko), une photo de joueur de 191 Ko en
 * 3,5 Ko. Les autres CDN servent l'image d'origine, déjà à une taille web.
 */
export default function imageLoader({ src, width }: { src: string; width: number; quality?: number }): string {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return src; // image locale
  }
  if (url.hostname === "a.espncdn.com" && !url.pathname.startsWith("/combiner/")) {
    return `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(url.pathname)}&w=${width}`;
  }
  return src;
}
