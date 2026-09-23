"use client";

import { createContext, useContext } from "react";
import { useApi } from "@/lib/client/useApi";
import type { TodayResponse } from "@/types";

const TodayContext = createContext<TodayResponse | null>(null);

/**
 * Données « aujourd'hui » partagées entre le hero et la section des matchs,
 * rafraîchies toutes les 30 s via /api/today (seulement si l'onglet est visible).
 */
export function HomeLive({ initial, children }: { initial: TodayResponse; children: React.ReactNode }) {
  const { data } = useApi<TodayResponse>("/api/today", { refreshMs: 30_000, initial });
  return <TodayContext.Provider value={data ?? initial}>{children}</TodayContext.Provider>;
}

export function useToday(): TodayResponse {
  const v = useContext(TodayContext);
  if (!v) throw new Error("useToday hors de HomeLive");
  return v;
}
