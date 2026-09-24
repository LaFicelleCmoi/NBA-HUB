"use client";

import { useEffect, useRef, useState } from "react";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Après un échec, on espace les tentatives jusqu'à cette limite. */
const MAX_BACKOFF_MS = 300_000;

/**
 * Récupère une ressource sur NOTRE proxy (/api/...) uniquement.
 *
 * `refreshMs` active un rafraîchissement périodique. Trois comportements
 * méritent d'être connus :
 *
 * - **Onglet masqué** : plus aucune requête. Au retour, si les données ont
 *   dépassé leur période de fraîcheur, on recharge immédiatement — sinon le
 *   visiteur retrouve un score figé le temps du prochain battement.
 * - **Échec** : les tentatives s'espacent (×2, jusqu'à 5 minutes) au lieu de
 *   marteler un amont déjà en difficulté. La cadence normale revient dès le
 *   premier succès.
 * - **Cadence variable** : passer un `refreshMs` différent relance simplement
 *   le cycle, ce qui permet d'accélérer quand un match est en cours et de
 *   ralentir sinon.
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let lastLoad = 0;

    const delay = () => {
      if (!refreshMs) return 0;
      // 30 s, 60 s, 120 s… plafonné, pour ne pas marteler un amont en panne.
      return failures === 0 ? refreshMs : Math.min(refreshMs * 2 ** failures, MAX_BACKOFF_MS);
    };

    const schedule = () => {
      if (!refreshMs || cancelled) return;
      clearTimeout(timer);
      timer = setTimeout(tick, delay());
    };

    const tick = () => {
      // Onglet masqué : on ne demande rien et on repassera plus tard.
      if (document.visibilityState !== "visible") return schedule();
      void load();
    };

    const load = async () => {
      ctrl?.abort();
      ctrl = new AbortController();
      lastLoad = Date.now();
      try {
        // `no-store` : nos réponses portent « stale-while-revalidate » pour le
        // CDN, et le navigateur l'applique aussi — il servait donc la copie
        // périmée puis revalidait en arrière-plan, affichant un score en
        // retard d'un cycle et doublant les requêtes. Le CDN, lui, continue
        // d'absorber la charge.
        const res = await fetch(path, {
          signal: ctrl.signal,
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || json === null) {
          failures++;
          setState((s) => ({ ...s, loading: false, error: json?.error ?? "Données indisponibles" }));
        } else {
          failures = 0;
          setState({ data: json, error: null, loading: false });
        }
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        failures++;
        setState((s) => ({ ...s, loading: false, error: "Connexion impossible" }));
      } finally {
        if (!cancelled) schedule();
      }
    };

    if (initialPath.current === path) {
      initialPath.current = null;
      lastLoad = Date.now();
      schedule();
    } else {
      setState((s) => ({ ...s, loading: s.data === null }));
      void load();
    }

    // Retour sur l'onglet : on rattrape le retard tout de suite si besoin.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || !refreshMs) return;
      if (Date.now() - lastLoad >= refreshMs) void load();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      ctrl?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path, refreshMs]);

  return state;
}
