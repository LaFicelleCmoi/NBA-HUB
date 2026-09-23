"use client";

import Link from "next/link";
import { useState } from "react";
import { LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { ZoneLegend, StandingsTables } from "@/components/standings/StandingsTable";
import type { Standings } from "@/types";

function LeaguePanel({ s }: { s: Standings }) {
  const [group, setGroup] = useState(0);
  const league = LEAGUES[s.league];
  const current = { ...s, groups: s.groups.length ? [s.groups[Math.min(group, s.groups.length - 1)]] : [] };
  return (
    <article
      aria-labelledby={`st-${s.league}`}
      className="flex w-[88vw] max-w-[560px] shrink-0 snap-start flex-col gap-3 sm:w-[520px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`st-${s.league}`} className="flex items-center gap-2 font-display text-2xl font-extrabold uppercase">
          <Logo logo={league.logo} alt="" size={26} />
          {league.name}
          <span className="text-sm font-semibold normal-case text-faint">{s.season}</span>
        </h3>
        {s.groups.length > 1 && (
          <div role="group" aria-label="Conférence" className="glass flex rounded-xl p-0.5 text-sm">
            {s.groups.map((g, i) => (
              <button
                key={g.name}
                type="button"
                aria-pressed={group === i}
                onClick={() => setGroup(i)}
                className={`rounded-lg px-3 py-1 font-semibold ${group === i ? "bg-surface-strong text-fg" : "text-muted"}`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {s.isPreviousSeason && (
        <p className="text-xs text-playin">Inter-saison : classement final de la saison {s.season}.</p>
      )}
      <StandingsTables standings={current} />
      <ZoneLegend league={s.league} />
      <Link href={`/${s.league}`} className="text-sm font-semibold hover:underline">
        Classement complet {league.name} →
      </Link>
    </article>
  );
}

export function StandingsOverview({ standings }: { standings: Standings[] }) {
  if (!standings.length) return <p className="text-sm text-muted">Classements indisponibles pour le moment.</p>;
  return (
    <div
      className="scrollbar-thin relative -mx-4 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6"
      role="region"
      aria-label="Classements par championnat (défilement horizontal)"
      tabIndex={0}
    >
      {standings.map((s) => (
        <LeaguePanel key={s.league} s={s} />
      ))}
    </div>
  );
}
