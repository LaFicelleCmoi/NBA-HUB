import "server-only";
import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validation";

/**
 * Cache annoncé au CDN.
 *
 * Le mode « direct » se passe volontairement de « stale-while-revalidate » :
 * cette directive autorise le CDN à servir une réponse périmée pendant qu'il
 * se rafraîchit. Avec 30 s de fraîcheur et 60 s de péremption tolérée, un
 * score pouvait arriver au visiteur avec une minute et demie de retard — le
 * `no-store` du navigateur n'y change rien, il ne contourne que son propre
 * cache. La source elle-même (ESPN) n'autorise que 10 s de fraîcheur : au-delà
 * de quelques secondes ici, on ne fait qu'ajouter du retard.
 */
function cacheHeader(maxAge: number, live: boolean): string {
  return live ? `public, s-maxage=${maxAge}` : `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
}

/**
 * Enveloppe commune des Route Handlers : cache CDN, et erreurs génériques
 * sans aucune fuite d'information (ni pile, ni URL amont, ni message brut).
 */
export async function respond<T>(fn: () => Promise<T>, maxAge: number, live = false): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data, { headers: { "Cache-Control": cacheHeader(maxAge, live) } });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[api]", err instanceof Error ? err.name + ": " + err.message : "unknown error");
    return NextResponse.json(
      { error: "Données momentanément indisponibles" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
