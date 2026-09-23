import Link from "next/link";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import type { LeagueId } from "@/types";

const TAGLINES: Record<LeagueId, string> = {
  nba: "30 franchises, conférences Est et Ouest, play-in puis playoffs.",
  wnba: "Le championnat féminin nord-américain, top 8 qualifié en playoffs.",
};

export function LeagueCards({ teamCounts }: { teamCounts: Record<LeagueId, number> }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {LEAGUE_IDS.map((id, i) => {
        const l = LEAGUES[id];
        return (
          <Reveal as="li" key={id} from={i % 2 === 0 ? "left" : "right"} delay={i * 0.08}>
            <Link
              href={`/${id}`}
              className="glass group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl p-6 transition-transform hover:-translate-y-1"
            >
              <span
                aria-hidden
                className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
                style={{ background: `linear-gradient(135deg, var(--${id}), var(--${id}-2))` }}
              />
              <div className="relative flex items-center justify-between">
                <Logo logo={l.logo} alt={`Logo ${l.name}`} size={56} className="h-14 w-14" />
                <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-muted">
                  {teamCounts[id] || "—"} équipes
                </span>
              </div>
              <div className="relative">
                <h3 className="font-display text-3xl font-extrabold uppercase">{l.name}</h3>
                <p className="text-sm font-semibold" style={{ color: `var(--${id})` }}>
                  {l.region}
                </p>
                <p className="mt-2 text-sm text-muted">{TAGLINES[id]}</p>
              </div>
              <span className="relative mt-auto text-sm font-semibold text-fg">
                Voir le championnat <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">→</span>
              </span>
            </Link>
          </Reveal>
        );
      })}
    </ul>
  );
}
