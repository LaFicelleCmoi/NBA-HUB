"use client";

import { useNow } from "@/lib/client/clock";

const SECONDE = 1000;
const MINUTE = 60 * SECONDE;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** Au-delà de trois jours, un compte à rebours n'a pas de sens : la date suffit. */
export const COUNTDOWN_WINDOW_MS = 3 * JOUR;

const deux = (n: number) => String(n).padStart(2, "0");

function decompose(reste: number) {
  return {
    j: Math.floor(reste / JOUR),
    h: Math.floor((reste % JOUR) / HEURE),
    m: Math.floor((reste % HEURE) / MINUTE),
    s: Math.floor((reste % MINUTE) / SECONDE),
  };
}

const enClair = ({ j, h, m, s }: ReturnType<typeof decompose>) =>
  [
    j && `${j} jour${j > 1 ? "s" : ""}`,
    h && `${h} heure${h > 1 ? "s" : ""}`,
    `${m} minute${m > 1 ? "s" : ""}`,
    `${s} seconde${s > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(", ");

/**
 * Compte à rebours jusqu'au coup d'envoi, à la seconde, à moins de trois
 * jours du match (rien au-delà). Dans la dernière heure, il passe en rouge.
 * À zéro, il annonce un coup d'envoi imminent : le match passe « en direct »
 * dès que le fournisseur le signale.
 *
 * - `full` : façon tableau d'affichage, unités sous les chiffres — pour
 *   la carte « Mon équipe » et la page d'un match ;
 * - `compact` : une ligne — pour les cartes de match, nombreuses à l'écran.
 *
 * Rien n'est rendu côté serveur (voir `useNow`).
 */
export function Countdown({ date, variant = "full" }: { date: string; variant?: "full" | "compact" }) {
  const now = useNow();
  const cible = Date.parse(date);
  if (now === null || !Number.isFinite(cible)) return null;
  const reste = cible - now;
  if (reste > COUNTDOWN_WINDOW_MS) return null;

  const imminent = reste <= 0;
  const urgent = reste < HEURE;
  const t = decompose(Math.max(0, reste));
  const label = imminent ? "Coup d’envoi imminent" : `Coup d’envoi dans ${enClair(t)}`;
  const ton = urgent ? "text-live" : "text-fg";

  if (variant === "compact") {
    return (
      <span
        role="timer"
        aria-label={label}
        className={`inline-flex items-center gap-1.5 text-xs ${urgent ? "text-live" : "text-muted"}`}
      >
        <svg
          aria-hidden
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2.5M9.5 2h5" />
        </svg>
        {imminent ? (
          <span className="font-semibold">Imminent</span>
        ) : (
          <span aria-hidden className="tabular font-semibold">
            {t.j > 0 && <span className="mr-1">{t.j} j</span>}
            {deux(t.h)}:{deux(t.m)}:{deux(t.s)}
          </span>
        )}
      </span>
    );
  }

  if (imminent) {
    return (
      <p role="timer" className="flex items-center gap-2 text-sm font-semibold text-live">
        <span aria-hidden className="live-dot h-2 w-2 rounded-full bg-live" />
        Coup d’envoi imminent
      </p>
    );
  }

  const unites: [string, string][] = [
    ...(t.j > 0 ? ([[String(t.j), "jours"]] as [string, string][]) : []),
    [deux(t.h), "heures"],
    [deux(t.m), "min"],
    [deux(t.s), "sec"],
  ];

  return (
    <div role="timer" aria-label={label} className="inline-flex flex-col gap-1">
      <span aria-hidden className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
        Coup d’envoi dans
      </span>
      <span aria-hidden className="flex items-start">
        {unites.map(([v, u], i) => (
          <span key={u} className="flex items-start">
            {i > 0 && (
              <span className="px-1 font-display text-2xl font-bold leading-none text-faint sm:px-1.5 sm:text-3xl">
                :
              </span>
            )}
            <span className="flex min-w-8 flex-col items-center">
              <span className={`tabular font-display text-2xl font-extrabold leading-none sm:text-3xl ${ton}`}>
                {v}
              </span>
              <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-faint">{u}</span>
            </span>
          </span>
        ))}
      </span>
    </div>
  );
}
