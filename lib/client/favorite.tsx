"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { isLeagueId } from "@/lib/leagues";
import type { FavoriteTeam, LeagueId } from "@/types";

const KEY = "hoopshub:favorite";
const EVENT = "hoopshub:favorite-change";

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): FavoriteTeam | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FavoriteTeam>;
    // Validation défensive : localStorage est modifiable par l'utilisateur.
    if (
      isLeagueId(v.league) &&
      typeof v.id === "string" &&
      /^[A-Za-z0-9]{1,8}$/.test(v.id) &&
      typeof v.name === "string" &&
      typeof v.logo?.light === "string" &&
      typeof v.logo?.dark === "string"
    )
      return { league: v.league, id: v.id, name: v.name.slice(0, 80), logo: v.logo };
  } catch {
    /* valeur corrompue : ignorée */
  }
  return null;
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

interface Ctx {
  favorite: FavoriteTeam | null;
  setFavorite: (t: FavoriteTeam | null) => void;
  isFavorite: (league: LeagueId, id: string) => boolean;
}

const FavoriteContext = createContext<Ctx>({ favorite: null, setFavorite: () => {}, isFavorite: () => false });

export function FavoriteProvider({ children }: { children: React.ReactNode }) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const favorite = useMemo(() => parse(raw), [raw]);

  const setFavorite = useCallback((t: FavoriteTeam | null) => {
    try {
      if (t) window.localStorage.setItem(KEY, JSON.stringify(t));
      else window.localStorage.removeItem(KEY);
    } catch {
      /* stockage indisponible (navigation privée) */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const isFavorite = useCallback(
    (league: LeagueId, id: string) => favorite?.league === league && favorite.id === id,
    [favorite],
  );

  const value = useMemo(() => ({ favorite, setFavorite, isFavorite }), [favorite, setFavorite, isFavorite]);
  return <FavoriteContext.Provider value={value}>{children}</FavoriteContext.Provider>;
}

export const useFavorite = () => useContext(FavoriteContext);
