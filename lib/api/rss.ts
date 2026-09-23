import "server-only";
import { env } from "@/lib/env";
import { UpstreamError } from "@/lib/api/http";
import type { NewsItem } from "@/types";

/**
 * Hôtes d'images autorisés : ils doivent correspondre aux `remotePatterns`
 * de next.config.ts, sinon next/image refuse l'image. Toute autre image est ignorée.
 */
const IMAGE_HOSTS = new Set(["storage.ghost.io", "www.basketusa.com", "a.espncdn.com"]);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m);
}

/** Texte brut : balises supprimées (React échappe ensuite l'affichage). */
function text(s: string): string {
  return decode(decode(s).replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(item: string, name: string): string | undefined {
  const m = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m?.[1];
}

function safeUrl(raw: string | undefined, hosts?: Set<string>): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(decode(raw).trim());
    if (u.protocol !== "https:") return undefined;
    if (hosts && !hosts.has(u.hostname)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

function imageOf(item: string): string | undefined {
  const candidates = [
    item.match(/<media:content[^>]*url="([^"]+)"/i)?.[1],
    item.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1],
    item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1],
    ...[...decode(tag(item, "content:encoded") ?? "").matchAll(/<img[^>]*src="([^"]+)"/gi)].map((m) => m[1]),
  ];
  for (const c of candidates) {
    const url = safeUrl(c, IMAGE_HOSTS);
    if (url) return url;
  }
  return undefined;
}

export function parseRss(xml: string, source: string, lang: "fr" | "en"): NewsItem[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const item of items.slice(0, 30)) {
    const title = text(tag(item, "title") ?? "");
    const url = safeUrl(tag(item, "link"));
    if (!title || !url) continue;
    const published = new Date(text(tag(item, "pubDate") ?? ""));
    let description = text(tag(item, "description") ?? "").replace(/The post .* appeared first on .*$/, "");
    if (description.length > 260) description = `${description.slice(0, 257).trimEnd()}…`;
    out.push({
      id: url,
      title: title.slice(0, 220),
      description: description || undefined,
      published: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
      image: imageOf(item),
      url,
      source,
      lang,
    });
  }
  return out;
}

export async function fetchRss(url: string, source: string, lang: "fr" | "en", revalidate: number): Promise<NewsItem[]> {
  const host = new URL(url).hostname;
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(env.upstreamTimeoutMs),
      headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": "Mozilla/5.0 (HoopsHub RSS reader)" },
    });
  } catch {
    throw new UpstreamError(504, host);
  }
  if (!res.ok) throw new UpstreamError(res.status, host);
  const xml = await res.text();
  return parseRss(xml.slice(0, 2_000_000), source, lang);
}
