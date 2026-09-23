"use client";

import { parisDayKey, formatDay } from "@/lib/time";
import { GameCard } from "@/components/games/GameCard";
import { Reveal } from "@/components/ui/Reveal";
import type { Game } from "@/types";

/** Liste de matchs groupée par jour (heure de Paris). */
export function GameList({ games, detailed = true }: { games: Game[]; detailed?: boolean }) {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const k = parisDayKey(g.date);
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  return (
    <div className="space-y-8">
      {[...groups.entries()].map(([day, list]) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h3 id={`day-${day}`} className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted">
            {formatDay(list[0].date)}
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((g, i) => (
              <Reveal as="li" key={g.id} delay={Math.min(i, 6) * 0.04}>
                <GameCard game={g} detailed={detailed} />
              </Reveal>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
