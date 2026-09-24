"use client";

import { createContext, useContext, useState } from "react";
import { useApi } from "@/lib/client/useApi";
import type { TodayResponse } from "@/types";

const TodayContext = createContext<TodayResponse | null>(null);

/** Cadences d'actualisation, de la plus soutenue à la plus économe. */
const EN_DIRECT = 15_000;
const IMMINENT = 30_000;
const JOURNEE = 120_000;
const REPOS = 600_000;

/** Un match qui commence dans moins de dix minutes vaut déjà un suivi rapproché. */
const IMMINENT_MS = 10 * 60_000;

/**
 * À quelle fréquence redemander les scores. Interroger toutes les 30 secondes
 * un jour sans match ne sert à rien et consomme le quota de requêtes ; à
 * l'inverse, 30 secondes sont trop lentes pendant un match.
 */
function cadence(today: TodayResponse | null): number {
  if (!today) return JOURNEE;
  const games = today.leagues.flatMap((l) => l.games);
  if (games.some((g) => g.status === "live")) return EN_DIRECT;

  const aVenir = [
    ...games.filter((g) => g.status === "scheduled"),
    ...today.leagues.flatMap((l) => (l.nextGame ? [l.nextGame] : [])),
  ];
  const imminent = aVenir.some((g) => {
    const dans = new Date(g.date).getTime() - Date.now();
    return dans > 0 && dans < IMMINENT_MS;
  });
  if (imminent) return IMMINENT;

  return games.length > 0 ? JOURNEE : REPOS;
}

/**
 * Données « aujourd'hui » partagées entre le hero et la section des matchs.
 * La cadence suit l'actualité : elle s'accélère dès qu'un match est en cours
 * ou sur le point de commencer, et se relâche le reste du temps.
 */
export function HomeLive({ initial, children }: { initial: TodayResponse; children: React.ReactNode }) {
  const [refreshMs, setRefreshMs] = useState(() => cadence(initial));
  const { data } = useApi<TodayResponse>("/api/today", { refreshMs, initial });
  const today = data ?? initial;

  // Ajustement pendant le rendu : la cadence dépend des données que le hook
  // vient de rendre, il faut donc la recalculer une fois celles-ci connues.
  const voulue = cadence(today);
  if (voulue !== refreshMs) setRefreshMs(voulue);

  return <TodayContext.Provider value={today}>{children}</TodayContext.Provider>;
}

export function useToday(): TodayResponse {
  const v = useContext(TodayContext);
  if (!v) throw new Error("useToday hors de HomeLive");
  return v;
}
