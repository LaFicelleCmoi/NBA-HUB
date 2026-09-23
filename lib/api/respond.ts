import "server-only";
import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validation";

/**
 * Enveloppe commune des Route Handlers : cache CDN, et erreurs génériques
 * sans aucune fuite d'information (ni pile, ni URL amont, ni message brut).
 */
export async function respond<T>(fn: () => Promise<T>, maxAge: number): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data, {
      headers: { "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` },
    });
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
