"use client";

import { useEffect, useState } from "react";

const SECONDE = 1000;
const MINUTE = 60 * SECONDE;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Seuil au-delà duquel un compte à rebours n'a pas de sens : on affiche la date. */
export const COUNTDOWN_WINDOW_MS = 3 * JOUR;

const deux = (n: number) => String(n).padStart(2, "0");

/**
 * Compte à rebours jusqu'au coup d'envoi, rafraîchi chaque seconde : jours,
 * heures, minutes, secondes. Il ne s'affiche qu'à moins de trois jours du
 * match ; au-delà, rien (la date suffit). À zéro, il annonce un coup d'envoi
 * imminent — le match passe « en direct » dès que le fournisseur le signale.
 *
 * L'heure courante vit dans un état mis à jour par un minuteur, jamais lue
 * pendant le rendu : le rendu reste pur et le minuteur s'arrête avec le
 * composant.
 */
export function Countdown({ date }: { date: string }) {
  const cible = Date.parse(date);
  const [maintenant, setMaintenant] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), SECONDE);
    return () => clearInterval(t);
  }, []);

  const reste = Math.max(0, cible - maintenant);
  if (!Number.isFinite(reste) || reste > COUNTDOWN_WINDOW_MS) return null;
  if (reste === 0) {
    return <p className="text-sm font-semibold text-live">Coup d’envoi imminent</p>;
  }

  const blocs: [number, string, string][] = [
    [Math.floor(reste / JOUR), "j", "jours"],
    [Math.floor((reste % JOUR) / HEURE), "h", "heures"],
    [Math.floor((reste % HEURE) / MINUTE), "min", "minutes"],
    [Math.floor((reste % MINUTE) / SECONDE), "s", "secondes"],
  ];
  // Moins d'un jour : le bloc des jours, à zéro, n'apporte rien.
  const visibles = blocs[0][0] === 0 ? blocs.slice(1) : blocs;

  return (
    <p
      className="flex items-end gap-1.5"
      role="timer"
      aria-label={`Coup d’envoi dans ${visibles.map(([n, , l]) => `${n} ${l}`).join(", ")}`}
    >
      {visibles.map(([n, unite], i) => (
        <span
          key={unite}
          aria-hidden
          className="flex min-w-11 flex-col items-center rounded-lg bg-fav-bg px-2 py-1 ring-1 ring-fav/40"
        >
          <span className="tabular font-display text-2xl font-extrabold leading-none text-fav">
            {i === 0 ? n : deux(n)}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{unite}</span>
        </span>
      ))}
    </p>
  );
}
