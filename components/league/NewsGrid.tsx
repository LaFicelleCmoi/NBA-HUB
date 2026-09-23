import Image from "next/image";
import { formatFullDate } from "@/lib/time";
import { Reveal } from "@/components/ui/Reveal";
import type { NewsItem } from "@/types";

export function NewsGrid({ items }: { items: NewsItem[] }) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Sélection de médias francophones, complétée par des sources anglophones. Les articles s’ouvrent dans un nouvel
        onglet.
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((n, i) => (
          <Reveal as="li" key={n.id} from={i % 2 === 0 ? "left" : "right"} delay={(i % 3) * 0.05}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group flex h-full flex-col overflow-hidden rounded-2xl"
            >
              {n.image ? (
                <div className="relative aspect-video overflow-hidden bg-line">
                  <Image
                    src={n.image}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div
                  aria-hidden
                  className="grid aspect-video place-items-center bg-gradient-to-br from-line to-transparent font-display text-3xl font-extrabold uppercase text-faint"
                >
                  {n.source}
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4" lang={n.lang}>
                <h3 className="font-semibold leading-snug group-hover:underline">{n.title}</h3>
                {n.description && <p className="line-clamp-3 text-sm text-muted">{n.description}</p>}
                <p className="mt-auto flex flex-wrap items-center gap-2 text-xs text-faint" lang="fr">
                  <span className="rounded-full border border-line-strong px-2 py-0.5 font-semibold text-muted">
                    {n.source}
                  </span>
                  <span>{n.lang === "fr" ? "Français" : "Anglais"}</span>
                  {n.published && (
                    <time dateTime={n.published}>· {formatFullDate(n.published)}</time>
                  )}
                </p>
                <span className="sr-only">(nouvel onglet)</span>
              </div>
            </a>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
