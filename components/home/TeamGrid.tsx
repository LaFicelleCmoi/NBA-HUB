"use client";

import { useState } from "react";
import { isFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { TeamPanel } from "@/components/home/TeamPanel";
import type { LeagueId, Team } from "@/types";

/**
 * Toutes les équipes de toutes les ligues, affichées ensemble : aucune n'est
 * masquée derrière un onglet. Chaque ligue forme une section repérable.
 */
function LeagueSection({ id, teams, onOpen }: { id: LeagueId; teams: Team[]; onOpen: (t: Team) => void }) {
  const favorite = useFavoriteTeam();
  const l = LEAGUES[id];
  return (
    <section aria-labelledby={`teams-${id}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-line pb-2">
        <Logo logo={l.logo} alt="" size={24} />
        <h3 id={`teams-${id}`} className="font-display text-2xl font-bold uppercase tracking-wide">
          {l.name}
        </h3>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold text-bg"
          style={{ background: `var(--${id})` }}
        >
          {teams.length} équipes
        </span>
        {l.conferences.length > 0 && (
          <span className="text-xs text-faint">Conférences {l.conferences.join(" et ")}</span>
        )}
      </div>
      {teams.length === 0 ? (
        <p className="text-sm text-muted">Liste des équipes indisponible pour le moment.</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-8">
          {teams.map((t, i) => {
            const fav = isFavoriteTeam(favorite, t.league, t.id);
            return (
              <Reveal as="li" key={t.id} delay={Math.min(i, 8) * 0.02}>
                <button
                  type="button"
                  onClick={() => onOpen(t)}
                  aria-haspopup="dialog"
                  aria-label={`${t.name} : voir les 5 derniers matchs${fav ? " (équipe favorite)" : ""}`}
                  className={`glass group flex h-full w-full flex-col items-center gap-2 rounded-2xl p-3 transition-transform hover:-translate-y-0.5 ${
                    fav ? "ring-2 ring-fav/70" : ""
                  }`}
                >
                  <Logo
                    logo={t.logo}
                    alt=""
                    size={56}
                    className="h-12 w-12 transition-transform group-hover:scale-110 sm:h-14 sm:w-14"
                  />
                  <span className="line-clamp-2 text-center text-xs font-medium text-muted">{t.shortName}</span>
                </button>
              </Reveal>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TeamGrid({ teams }: { teams: Record<LeagueId, Team[]> }) {
  const [open, setOpen] = useState<Team | null>(null);
  return (
    <div>
      <div className="space-y-10">
        {LEAGUE_IDS.map((id) => (
          <LeagueSection key={id} id={id} teams={teams[id] ?? []} onOpen={setOpen} />
        ))}
      </div>
      <TeamPanel team={open} onClose={() => setOpen(null)} />
    </div>
  );
}
