"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useSyncExternalStore } from "react";
import { useApi } from "@/lib/client/useApi";
import { GameList } from "@/components/games/GameList";
import { StandingsTables, ZoneLegend } from "@/components/standings/StandingsTable";
import { LeadersView } from "@/components/league/LeadersView";
import { NewsGrid } from "@/components/league/NewsGrid";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import type { GamesResponse, LeadersResponse, LeagueId, NewsItem, Standings } from "@/types";

const TABS = [
  { key: "classement", label: "Classement" },
  { key: "resultats", label: "Résultats" },
  { key: "calendrier", label: "Calendrier" },
  { key: "leaders", label: "Leaders" },
  { key: "actualites", label: "Actualités" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const isTab = (v: string): v is TabKey => TABS.some((t) => t.key === v);

// L'onglet actif vit dans l'ancre d'URL (#resultats, #leaders…) : partageable, et
// synchronisé avec les boutons précédent/suivant du navigateur.
const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  // « popstate » est indispensable : c'est le seul événement émis quand on
  // revient sur une entrée d'historique poussée par history.pushState.
  window.addEventListener("popstate", cb);
  return () => {
    window.removeEventListener("hashchange", cb);
    window.removeEventListener("popstate", cb);
  };
};
const readHash = (): TabKey => {
  const h = window.location.hash.slice(1);
  return isTab(h) ? h : "classement";
};

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 rounded-xl border border-playin/40 bg-playin-bg px-3 py-2 text-sm text-fg" role="note">
      {children}
    </p>
  );
}

function StandingsPanel({ league, initial }: { league: LeagueId; initial: Standings | null }) {
  const { data, error, loading } = useApi<Standings>(`/api/${league}/standings`, { initial });
  if (loading) return <SkeletonList rows={8} className="h-10" />;
  if (!data) return <ErrorState message={error ?? "Classement indisponible"} />;
  return (
    <div className="space-y-4">
      {data.isPreviousSeason && (
        <Note>Inter-saison : la nouvelle saison n’a pas commencé. Classement final de la saison {data.season}.</Note>
      )}
      <ZoneLegend league={league} />
      <StandingsTables standings={data} showStreak />
    </div>
  );
}

/**
 * Cadence d'actualisation d'une liste de matchs. Un match en cours mérite
 * 20 secondes ; une liste figée — calendrier à venir, résultats acquis — n'a
 * pas besoin d'être redemandée toutes les 30 secondes.
 */
function cadenceMatchs(data: GamesResponse | null, view: "results" | "upcoming"): number {
  if (data?.games.some((g) => g.status === "live")) return 20_000;
  return view === "upcoming" ? 120_000 : 600_000;
}

function GamesPanel({ league, view }: { league: LeagueId; view: "results" | "upcoming" }) {
  const [refreshMs, setRefreshMs] = useState(() => cadenceMatchs(null, view));
  const { data, error, loading } = useApi<GamesResponse>(`/api/${league}/games?view=${view}`, { refreshMs });

  // Ajustement pendant le rendu : la cadence dépend des matchs qui viennent
  // d'arriver.
  const voulue = cadenceMatchs(data, view);
  if (voulue !== refreshMs) setRefreshMs(voulue);
  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    );
  if (!data) return <ErrorState message={error ?? "Matchs indisponibles"} />;
  return (
    <div>
      {data.note && <Note>{data.note}</Note>}
      {data.games.length === 0 ? (
        <EmptyState title={view === "results" ? "Aucun résultat" : "Aucun match programmé"}>
          {view === "upcoming" && <p>Revenez bientôt : le calendrier sera affiché dès sa publication.</p>}
        </EmptyState>
      ) : (
        <GameList games={data.games} />
      )}
    </div>
  );
}

function LeadersPanel({ league }: { league: LeagueId }) {
  const { data, error, loading } = useApi<LeadersResponse>(`/api/${league}/leaders`);
  if (loading)
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-96" />
        ))}
      </div>
    );
  if (!data) return <ErrorState message={error ?? "Leaders indisponibles"} />;
  return <LeadersView data={data} />;
}

function NewsPanel({ league }: { league: LeagueId }) {
  const { data, error, loading } = useApi<NewsItem[]>(`/api/${league}/news`);
  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    );
  if (!data) return <ErrorState message={error ?? "Actualités indisponibles"} />;
  if (data.length === 0)
    return (
      <EmptyState title="Pas d’actualités disponibles" icon="📰">
        <p>Aucun article pour le moment. Réessayez dans quelques minutes.</p>
      </EmptyState>
    );
  return <NewsGrid items={data} />;
}

export function LeagueTabs({ league, initialStandings }: { league: LeagueId; initialStandings: Standings | null }) {
  const tab = useSyncExternalStore(subscribeHash, readHash, () => "classement" as TabKey);
  const change = (k: TabKey) => {
    if (k === tab) return;
    // pushState (et non replaceState) : chaque onglet devient une entrée
    // d'historique, donc « précédent » ramène bien à l'onglet précédent.
    history.pushState(null, "", `#${k}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  };

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-4 bg-bg/80 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Tabs
          idPrefix="league"
          label="Sections du championnat"
          tabs={[...TABS]}
          active={tab}
          onChange={change}
          accent={`var(--${league})`}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          id={`league-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`league-tab-${tab}`}
          tabIndex={0}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="mt-6 outline-none"
        >
          {tab === "classement" && <StandingsPanel league={league} initial={initialStandings} />}
          {tab === "resultats" && <GamesPanel league={league} view="results" />}
          {tab === "calendrier" && <GamesPanel league={league} view="upcoming" />}
          {tab === "leaders" && <LeadersPanel league={league} />}
          {tab === "actualites" && <NewsPanel league={league} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
