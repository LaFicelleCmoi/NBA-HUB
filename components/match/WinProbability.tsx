"use client";

import { useId, useState, type PointerEvent } from "react";
import { Logo } from "@/components/ui/Logo";
import type { Team, WinProbabilityPoint } from "@/types";

const L = 800;
const H = 220;
const MARGE = 28;

/**
 * Couleur de club utilisable comme aplat : celles trop proches du noir ou du
 * blanc (Spurs, Nets…) disparaîtraient sur l'un des deux thèmes.
 */
function lisible(hex?: string): string | undefined {
  const m = hex?.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.12 || lum > 0.9 ? undefined : `#${m[1]}`;
}

const periode = (n: number) => (n <= 4 ? `Q${n}` : n === 5 ? "Prol." : `Prol. ${n - 4}`);

/**
 * Probabilité de victoire au fil du match, telle qu'ESPN l'estime action par
 * action. Une seule courbe : en haut l'équipe à domicile, en bas l'équipe en
 * déplacement, la ligne médiane à 50 %. L'aire prend la couleur de l'équipe
 * favorite du moment ; les noms sont écrits sur le graphique, la couleur ne
 * porte donc jamais seule l'identité. Survol : moment et probabilité exacts.
 */
export function WinProbability({
  points,
  regulation,
  away,
  home,
}: {
  points: WinProbabilityPoint[];
  regulation: number;
  away: Team;
  home: Team;
}) {
  const id = useId();
  const [survol, setSurvol] = useState<number | null>(null);
  const fin = Math.max(regulation, points.at(-1)?.elapsed ?? 0);
  const x = (s: number) => (s / fin) * L;
  const y = (p: number) => MARGE + (1 - p) * (H - 2 * MARGE);
  const milieu = y(0.5);

  const ligne = points.map((p, i) => `${i ? "L" : "M"}${x(p.elapsed).toFixed(1)},${y(p.home).toFixed(1)}`).join("");
  const aire = `${ligne}L${x(points.at(-1)!.elapsed).toFixed(1)},${milieu}L${x(points[0].elapsed).toFixed(1)},${milieu}Z`;

  // Repères de période : fin de chaque quart-temps, puis des prolongations.
  const quart = regulation / 4;
  const reperes = [quart, 2 * quart, 3 * quart];
  for (let t = regulation; t < fin; t += 300) reperes.push(t);

  const couleurDom = lisible(home.color) ?? "var(--direct)";
  const couleurExt = lisible(away.color) ?? "var(--live)";
  const actif = survol !== null ? points[survol] : points.at(-1)!;
  const favori = actif.home >= 0.5 ? home : away;
  const pct = Math.round(Math.max(actif.home, 1 - actif.home) * 100);

  const surMouvement = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const s = ((e.clientX - r.left) / r.width) * fin;
    let meilleur = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(points[i].elapsed - s) < Math.abs(points[meilleur].elapsed - s)) meilleur = i;
    }
    setSurvol(meilleur);
  };

  return (
    <figure className="glass space-y-3 rounded-2xl p-4 sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">Probabilité de victoire</span>
        <span className="flex items-center gap-2 text-sm" aria-live="polite">
          <Logo logo={favori.logo} alt="" size={20} className="h-5 w-5" />
          <span className="font-semibold">{favori.shortName}</span>
          <span className="tabular font-display text-2xl font-extrabold">{pct} %</span>
          <span className="text-faint">
            {survol !== null ? `${periode(actif.period)} · ${actif.clock}` : "dernière estimation"}
          </span>
        </span>
      </figcaption>

      <div>
        <div className="relative">
          {/* Hauteur fixe et traits non déformés : sur mobile, la courbe garde
            une épaisseur et des libellés lisibles au lieu de rétrécir. */}
          <svg
            viewBox={`0 0 ${L} ${H}`}
            preserveAspectRatio="none"
            className="block h-48 w-full touch-none select-none sm:h-56"
            role="img"
            aria-label={`Probabilité de victoire : ${favori.name} à ${pct} %`}
            onPointerMove={surMouvement}
            onPointerLeave={() => setSurvol(null)}
          >
            <defs>
              <clipPath id={`${id}-haut`}>
                <rect x="0" y="0" width={L} height={milieu} />
              </clipPath>
              <clipPath id={`${id}-bas`}>
                <rect x="0" y={milieu} width={L} height={H - milieu} />
              </clipPath>
            </defs>

            {reperes.map((t) => (
              <line
                key={t}
                x1={x(t)}
                x2={x(t)}
                y1={MARGE / 2}
                y2={H - MARGE / 2}
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1="0"
              x2={L}
              y1={milieu}
              y2={milieu}
              stroke="var(--border-strong)"
              strokeWidth="1"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />

            <path d={aire} fill={couleurDom} fillOpacity="0.35" clipPath={`url(#${id}-haut)`} />
            <path d={aire} fill={couleurExt} fillOpacity="0.35" clipPath={`url(#${id}-bas)`} />
            <path
              d={ligne}
              fill="none"
              stroke="var(--text)"
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="pointer-events-none absolute left-2 top-1 text-xs font-semibold text-muted">
            {home.shortName} · 100 %
          </span>
          <span className="pointer-events-none absolute bottom-1 left-2 text-xs font-semibold text-muted">
            {away.shortName} · 100 %
          </span>
          <span
            className="pointer-events-none absolute right-2 -translate-y-full text-xs text-faint"
            style={{ top: `${(milieu / H) * 100}%` }}
          >
            50 %
          </span>
          {survol !== null && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute top-0 h-full w-px bg-fg/40"
                style={{ left: `${(x(actif.elapsed) / L) * 100}%` }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-fg"
                style={{ left: `${(x(actif.elapsed) / L) * 100}%`, top: `${(y(actif.home) / H) * 100}%` }}
              />
            </>
          )}
        </div>
        <div className="mt-1 flex text-xs text-faint" aria-hidden>
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className="text-center" style={{ width: `${(quart / fin) * 100}%` }}>
              Q{n}
            </span>
          ))}
          {fin > regulation && (
            <span className="text-center" style={{ width: `${((fin - regulation) / fin) * 100}%` }}>
              Prol.
            </span>
          )}
        </div>
      </div>
    </figure>
  );
}
