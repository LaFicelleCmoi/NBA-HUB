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

/**
 * fetch côté serveur uniquement, avec timeout et cache Next.js (Data Cache).
 * `revalidate` en secondes.
 */
export async function fetchJson<T>(url: string, revalidate: number | "no-store"): Promise<T> {
  const source = new URL(url).hostname;
  let res: Response;
  try {
    res = await fetch(url, {
      ...(revalidate === "no-store" ? { cache: "no-store" as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(env.upstreamTimeoutMs),
      headers: { accept: "application/json", "user-agent": "HoopsHub/1.0 (+server proxy)" },
    });
  } catch {
    throw new UpstreamError(504, source);
  }
  if (!res.ok) throw new UpstreamError(res.status, source);
  try {
    return (await res.json()) as T;
  } catch {
    throw new UpstreamError(502, source);
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
