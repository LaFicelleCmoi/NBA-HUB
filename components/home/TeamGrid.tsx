"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useFavorite } from "@/lib/client/favorite";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { Tabs } from "@/components/ui/Tabs";
import { TeamPanel } from "@/components/home/TeamPanel";
import type { LeagueId, Team } from "@/types";

export function TeamGrid({ teams }: { teams: Record<LeagueId, Team[]> }) {
  const [league, setLeague] = useState<LeagueId>("nba");
  const [open, setOpen] = useState<Team | null>(null);
  const { isFavorite } = useFavorite();
  const list = teams[league] ?? [];

  return (
    <div>
      <Tabs
        idPrefix="teams"
        label="Ligue des équipes affichées"
        tabs={LEAGUE_IDS.map((l) => ({ key: l, label: `${LEAGUES[l].name} (${teams[l]?.length ?? 0})` }))}
        active={league}
        onChange={setLeague}
        accent={`var(--${league})`}
      />
      <div id={`teams-panel-${league}`} role="tabpanel" aria-labelledby={`teams-tab-${league}`} className="mt-4">
        <AnimatePresence mode="wait">
          <motion.ul
            key={league}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-3 gap-2 sm:grid-cols-5 sm:gap-3 lg:grid-cols-8"
          >
            {list.length === 0 && (
              <li className="col-span-full text-sm text-muted">Liste des équipes indisponible pour le moment.</li>
            )}
            {list.map((t) => {
              const fav = isFavorite(t.league, t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(t)}
                    aria-haspopup="dialog"
                    aria-label={`${t.name} : voir les 5 derniers matchs${fav ? " (équipe favorite)" : ""}`}
                    className={`glass group flex w-full flex-col items-center gap-2 rounded-2xl p-3 transition-transform hover:-translate-y-0.5 ${
                      fav ? "ring-2 ring-fav/70" : ""
                    }`}
                  >
                    <Logo
                      logo={t.logo}
                      alt=""
                      size={56}
                      className="h-12 w-12 transition-transform group-hover:scale-110 sm:h-14 sm:w-14"
                    />
                    <span className="line-clamp-1 text-center text-xs font-medium text-muted">{t.shortName}</span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        </AnimatePresence>
      </div>
      <TeamPanel team={open} onClose={() => setOpen(null)} />
    </div>
  );
}
