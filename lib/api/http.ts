import "server-only";
import { unstable_cache } from "next/cache";
import { env } from "@/lib/env";

/** Erreur amont : le message n'est jamais renvoyé tel quel au client. */
export class UpstreamError extends Error {
  constructor(
    public readonly status: number,
    public readonly source: string,
  ) {
    super(`Upstream ${source} responded ${status}`);
    this.name = "UpstreamError";
  }
}

/** Une tentative d'appel amont, sans réessai. */
async function attemptJson<T>(url: string, revalidate: number | "no-store", source: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...(revalidate === "no-store" ? { cache: "no-store" as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(env.upstreamTimeoutMs),
      headers: { accept: "application/json", "user-agent": "HoopsHub/1.0 (+server proxy)" },
    });
  } catch {
    // Délai dépassé, DNS ou réseau : échec transitoire, donc réessayable.
    throw new UpstreamError(504, source);
  }
  if (!res.ok) throw new UpstreamError(res.status, source);
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(502, source);
  }
}

/** Un 4xx est une réponse définitive de l'amont : insister n'y changera rien. */
const isTransient = (status: number) => status >= 500 || status === 429;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tentatives supplémentaires après un échec transitoire. */
const RETRIES = 2;
const RETRY_DELAY_MS = 300;

/**
 * fetch côté serveur uniquement, avec timeout, réessais et cache Next.js
 * (Data Cache). `revalidate` en secondes.
 *
 * Le réessai n'est pas une précaution théorique : le premier appel à ESPN
 * après un démarrage à froid (DNS + TLS + cache CDN froid) dépasse
 * régulièrement le délai, là où l'appel suivant répond en quelques centaines
 * de millisecondes. Sans réessai, la page affichait « Données indisponibles »
 * à la première visite alors que l'amont fonctionnait.
 */
export async function fetchJson<T>(url: string, revalidate: number | "no-store"): Promise<T> {
  const source = new URL(url).hostname;
  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptJson<T>(url, revalidate, source);
    } catch (err) {
      const status = err instanceof UpstreamError ? err.status : 500;
      if (attempt >= RETRIES || !isTransient(status)) throw err;
      console.warn(`[upstream] ${source} ${status}, nouvelle tentative ${attempt + 1}/${RETRIES}`);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

/**
 * Pour les réponses volumineuses (> 2 Mo, limite du Data Cache) : on ne
 * met pas la réponse brute en cache mais le résultat normalisé, beaucoup
 * plus léger, via unstable_cache.
 */
export function cachedNormalized<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  key: string,
  revalidate: number,
): (...args: A) => Promise<R> {
  return unstable_cache(fn, [key], { revalidate });
}

/** Variante tolérante : renvoie `null` au lieu de lever une erreur. */
export async function fetchJsonSafe<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    return await fetchJson<T>(url, revalidate);
  } catch (err) {
    console.warn("[upstream]", err instanceof Error ? err.message : "unknown error");
    return null;
  }
}
