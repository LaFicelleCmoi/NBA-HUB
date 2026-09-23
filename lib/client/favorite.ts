"use client";

import { useSyncExternalStore } from "react";
import { isLeagueId } from "@/lib/leagues";
import type { FavoriteTeam, LeagueId } from "@/types";

const STORAGE_KEY = "hoopshub:favorite";
const CHANGE_EVENT = "hoopshub:favorite-change";

// Repli en mémoire si le stockage est indisponible (navigation privée stricte…).
let memoryRaw: string | null = null;
let cachedRaw: string | null = null;
let cachedFavorite: FavoriteTeam | null = null;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return memoryRaw;
  }
}

/** Relit la valeur stockée en vérifiant sa forme : elle vient du navigateur, pas du serveur. */
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
    ) {
      return {
        league: v.league,
        id: v.id,
        name: v.name.slice(0, 80),
        logo: {
          light: v.logo.light,
          dark: v.logo.dark,
        },
      };
    }
  } catch {
    /* valeur corrompue : ignorée */
  }
  return null;
}

function getSnapshot(): FavoriteTeam | null {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFavorite = parse(raw);
  }
  return cachedFavorite;
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Équipe favorite actuelle, partagée par tous les composants de la page (et les autres onglets). */
export function useFavoriteTeam(): FavoriteTeam | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

export function setFavoriteTeam(team: FavoriteTeam | null) {
  const raw = team ? JSON.stringify(team) : null;
  memoryRaw = raw;
  try {
    if (raw) window.localStorage.setItem(STORAGE_KEY, raw);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible : le choix reste valable jusqu'au rechargement de la page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Cette équipe est-elle la favorite du visiteur ? */
export function useIsFavorite(league: LeagueId, teamId: string): boolean {
  const favorite = useFavoriteTeam();
  return favorite?.league === league && favorite?.id === teamId;
}

/**
 * Même test, mais sans hook : les grilles, tableaux et listes comparent des
 * dizaines d'équipes dans une boucle, où `useIsFavorite` ne peut pas être
 * appelé. Ils lisent la favorite une fois avec `useFavoriteTeam`, puis
 * l'utilisent ici.
 */
export function isFavoriteTeam(favorite: FavoriteTeam | null, league: LeagueId, teamId: string): boolean {
  return favorite?.league === league && favorite?.id === teamId;
}
