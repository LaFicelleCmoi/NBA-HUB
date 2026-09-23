"use client";

import { useEffect, useRef, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Récupère une ressource sur NOTRE proxy (/api/...) uniquement.
 * `refreshMs` active un rafraîchissement périodique (suspendu quand l'onglet est masqué).
 */
export function useApi<T>(path: string | null, opts: { refreshMs?: number; initial?: T | null } = {}) {
  const { refreshMs, initial = null } = opts;
  const [state, setState] = useState<State<T>>({
    data: initial,
    error: null,
    loading: path !== null && initial === null,
  });
  // Chemin auquel `initial` correspond : tant qu'il n'est pas « consommé », le
  // premier effet ne refait pas l'appel que le serveur a déjà fait.
  const initialPath = useRef(initial !== null ? path : null);
  const [shownPath, setShownPath] = useState(path);

  // Changement de ressource : on repart de zéro. Sans cela, `data` garde la
  // réponse du chemin précédent et le consommateur affiche les données d'une
  // autre entité (ex. les matchs de l'équipe ouverte juste avant).
  if (shownPath !== path) {
    setShownPath(path);
    setState({ data: null, error: null, loading: path !== null });
  }

  useEffect(() => {
    if (!path || !path.startsWith("/api/")) return;
    let ctrl: AbortController | null = null;
    let cancelled = false;

    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(path, { signal: ctrl.signal, headers: { accept: "application/json" } });
        const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || json === null) {
          setState((s) => ({ ...s, loading: false, error: json?.error ?? "Données indisponibles" }));
        } else {
          setState({ data: json, error: null, loading: false });
        }
      } catch (e) {
        if (!cancelled && !(e instanceof DOMException && e.name === "AbortError"))
          setState((s) => ({ ...s, loading: false, error: "Connexion impossible" }));
      }
    };

    if (initialPath.current === path) initialPath.current = null;
    else {
      setState((s) => ({ ...s, loading: s.data === null }));
      void load();
    }

    let timer: ReturnType<typeof setInterval> | undefined;
    if (refreshMs) {
      timer = setInterval(() => {
        if (document.visibilityState === "visible") void load();
      }, refreshMs);
    }
    return () => {
      cancelled = true;
      ctrl?.abort();
      if (timer) clearInterval(timer);
    };
  }, [path, refreshMs]);

  return state;
}
