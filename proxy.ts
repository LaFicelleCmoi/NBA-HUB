import { NextResponse, type NextRequest } from "next/server";

/* ------------------------------------------------------------------ */
/* Rate limiting basique (fenêtre fixe, en mémoire, par instance).     */
/* Suffisant contre l'abus naïf ; pour une vraie limite globale,       */
/* brancher un store partagé (Upstash/Vercel KV) — voir README.        */
/* ------------------------------------------------------------------ */

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX) || 60;
const buckets = new Map<string, { count: number; reset: number }>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}

function rateLimit(req: NextRequest): NextResponse | null {
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  }
  const key = clientIp(req);
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + WINDOW_MS });
    return null;
  }
  bucket.count++;
  if (bucket.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Trop de requêtes, réessayez dans un instant." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((bucket.reset - now) / 1000)),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* CSP stricte avec nonce par requête pour les pages HTML.             */
/* ------------------------------------------------------------------ */

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Framer Motion anime via l'attribut style : 'unsafe-inline' est requis pour les styles uniquement.
    "style-src 'self' 'unsafe-inline'",
    // Toutes les images passent par /_next/image (optimiseur Next) : aucune origine tierce n'est nécessaire.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return NextResponse.json({ error: "Méthode non autorisée" }, { status: 405, headers: { Allow: "GET" } });
    }
    return rateLimit(req) ?? NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
