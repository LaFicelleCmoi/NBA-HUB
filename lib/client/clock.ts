"use client";

import { useSyncExternalStore } from "react";

/**
 * Horloge partagée, à la seconde.
 *
 * Une page de calendrier affiche des dizaines de comptes à rebours : un
 * minuteur par carte, ce serait des dizaines de minuteurs et autant de rendus
 * décalés. Ici, un seul minuteur sert tous les abonnés ; il démarre avec le
 * premier et s'arrête avec le dernier.
 *
 * Côté serveur, l'heure vaut `null` : l'heure du serveur et celle du
 * navigateur ne coïncident jamais à la seconde, un compte à rebours rendu
 * côté serveur serait faux à l'hydratation. Il n'apparaît donc qu'une fois la
 * page chargée.
 */

const abonnes = new Set<() => void>();
let minuteur: ReturnType<typeof setInterval> | undefined;

function subscribe(cb: () => void) {
  abonnes.add(cb);
  minuteur ??= setInterval(() => abonnes.forEach((f) => f()), 1000);
  return () => {
    abonnes.delete(cb);
    if (abonnes.size === 0) {
      clearInterval(minuteur);
      minuteur = undefined;
    }
  };
}

/** Arrondie à la seconde : deux lectures dans la même seconde donnent la même valeur. */
const lire = () => Math.floor(Date.now() / 1000) * 1000;

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, lire, () => null);
}
