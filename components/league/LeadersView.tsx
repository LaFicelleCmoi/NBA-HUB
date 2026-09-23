"use client";

import Image from "next/image";
import Link from "next/link";
import { isFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import type { LeadersResponse } from "@/types";

function Headshot({ src, name }: { src?: string; name: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2);
  if (!src)
    return (
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-line text-xs font-bold text-muted">
        {initials}
      </span>
    );
  return (
    <Image
      src={src}
      alt=""
      width={40}
      height={40}
      sizes="40px"
      className="h-10 w-10 shrink-0 rounded-full bg-line object-cover object-top"
    />
  );
}

export function LeadersView({ data }: { data: LeadersResponse }) {
  const favorite = useFavoriteTeam();
  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Moyennes par match · saison {data.season}. Top 10 de chaque catégorie.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.leaders.map((cat, i) => (
          <Reveal key={cat.category} from={i % 2 === 0 ? "left" : "right"} delay={(i % 3) * 0.05}>
            <section aria-labelledby={`lead-${cat.category}`} className="glass h-full rounded-2xl p-4">
              <h3 id={`lead-${cat.category}`} className="mb-3 font-display text-xl font-bold uppercase tracking-wide">
                {cat.label}
              </h3>
              {cat.entries.length === 0 ? (
                <p className="text-sm text-muted">Pas encore de données.</p>
              ) : (
                <ol className="space-y-1">
                  {cat.entries.map((e) => {
                    const fav = e.team ? isFavoriteTeam(favorite, e.team.league, e.team.id) : false;
                    return (
                      <li
                        key={e.playerId}
                        className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                          e.rank === 1 ? "bg-line/50" : ""
                        } ${fav ? "ring-1 ring-fav/60" : ""}`}
                      >
                        <span className="tabular w-5 text-right text-sm font-bold text-faint">{e.rank}</span>
                        <Headshot src={e.headshot} name={e.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{e.name}</p>
                          {e.team && (
                            <Link
                              href={`/${e.team.league}/equipe/${e.team.id}`}
                              className="flex items-center gap-1 text-xs text-faint hover:underline"
                            >
                              <Logo logo={e.team.logo} alt="" size={14} />
                              <span className="truncate">{e.team.shortName}</span>
                              {fav && <span className="text-fav" aria-label="Équipe favorite">★</span>}
                            </Link>
                          )}
                        </div>
                        <span className="tabular font-display text-xl font-bold">{e.displayValue}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
