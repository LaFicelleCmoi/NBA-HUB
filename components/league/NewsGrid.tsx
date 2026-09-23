import Image from "next/image";
import { formatFullDate } from "@/lib/time";
import { Reveal } from "@/components/ui/Reveal";
import type { NewsItem } from "@/types";

export function NewsGrid({ items }: { items: NewsItem[] }) {
  return (
    <div>
      <p className="mb-4 text-sm text-muted">Articles publiés par ESPN (en anglais), ouverts dans un nouvel onglet.</p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((n, i) => (
          <Reveal as="li" key={n.id} from={i % 2 === 0 ? "left" : "right"} delay={(i % 3) * 0.05}>
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group flex h-full flex-col overflow-hidden rounded-2xl"
            >
              {n.image && (
                <div className="relative aspect-video overflow-hidden bg-line">
                  <Image
                    src={n.image}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="font-semibold leading-snug group-hover:underline">{n.title}</h3>
                {n.description && <p className="line-clamp-3 text-sm text-muted">{n.description}</p>}
                {n.published && (
                  <time dateTime={n.published} className="mt-auto text-xs text-faint">
                    {formatFullDate(n.published)}
                  </time>
                )}
                <span className="sr-only">(nouvel onglet)</span>
              </div>
            </a>
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
