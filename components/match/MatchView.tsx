"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/useApi";
import { GameCard } from "@/components/games/GameCard";
import { Logo } from "@/components/ui/Logo";
import type { GameDetail, LeagueId, Play } from "@/types";

/** Libellé d'une période : quarts-temps, puis prolongations. */
const periodeCourte = (n: number) => (n <= 4 ? `Q${n}` : n === 5 ? "Prol." : `Prol. ${n - 4}`);
const periodeLongue = (n: number) =>
  n <= 4 ? `${n === 1 ? "1er" : `${n}e`} quart-temps` : n === 5 ? "Prolongation" : `${n - 4}e prolongation`;

type Filtre = "tout" | "paniers";

function Action({ play, detail }: { play: Play; detail: GameDetail }) {
  const { home, away } = detail.game;
  const equipe = play.teamId === home.team.id ? home.team : play.teamId === away.team.id ? away.team : undefined;
  return (
    <li
      className={`flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0 sm:px-4 ${
        play.scoring ? "bg-direct-bg/40" : ""
      }`}
    >
      <span className="tabular w-12 shrink-0 text-xs text-faint">{play.clock}</span>
      <span className="grid h-6 w-6 shrink-0 place-items-center">
        {equipe ? <Logo logo={equipe.logo} alt="" size={22} className="h-5.5 w-5.5" /> : null}
      </span>
      <p className={`min-w-0 flex-1 text-sm ${play.scoring ? "font-semibold" : "text-muted"}`}>
        {play.text}
        {equipe && <span className="sr-only"> ({equipe.name})</span>}
      </p>
      {play.scoring && play.points ? (
        <span className="shrink-0 rounded-md bg-direct-bg px-1.5 py-0.5 text-xs font-bold text-direct">
          +{play.points}
        </span>
      ) : null}
      <span className={`tabular w-14 shrink-0 text-right text-sm ${play.scoring ? "font-bold" : "text-faint"}`}>
        {play.away}-{play.home}
      </span>
    </li>
  );
}

/**
 * Page d'un match : en-tête et play-by-play.
 *
 * Pendant un match, le déroulé est redemandé toutes les dix secondes — la
 * fraîcheur que permettent les fournisseurs. Une fois le match terminé, plus
 * rien n'est redemandé.
 */
export function MatchView({ league, id, initial }: { league: LeagueId; id: string; initial: GameDetail }) {
  const [refreshMs, setRefreshMs] = useState(initial.game.status === "live" ? 10_000 : 0);
  const { data } = useApi<GameDetail>(`/api/${league}/games/${id}`, { initial, refreshMs });
  const detail = data ?? initial;

  // Le match peut commencer ou s'achever pendant qu'on le regarde : la cadence suit.
  const voulue = detail.game.status === "live" ? 10_000 : 0;
  if (voulue !== refreshMs) setRefreshMs(voulue);

  const [filtre, setFiltre] = useState<Filtre>("tout");
  const periodes = [...new Set(detail.plays.map((p) => p.period).filter((p) => p > 0))].sort((a, b) => a - b);
  const [periode, setPeriode] = useState<number | "toutes">("toutes");

  const visibles = detail.plays
    .filter((p) => (filtre === "paniers" ? p.scoring : true))
    .filter((p) => (periode === "toutes" ? true : p.period === periode));

  // Les plus récentes en haut : pendant un match, c'est là que le regard se pose.
  const parPeriode = new Map<number, Play[]>();
  for (const p of [...visibles].reverse()) parPeriode.set(p.period, [...(parPeriode.get(p.period) ?? []), p]);
  const groupes = [...parPeriode.entries()].sort((a, b) => b[0] - a[0]);

  const bouton = (actif: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
      actif ? "bg-surface-strong text-fg shadow-sm" : "text-muted hover:text-fg"
    }`;

  return (
    <div className="space-y-8">
      <div className="mx-auto max-w-2xl">
        <GameCard game={detail.game} showDate matchLink={false} />
      </div>

      <section aria-labelledby="pbp-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-faint">
              {detail.game.status === "live" ? "En direct · actualisé toutes les 10 s" : "Déroulé complet"}
            </p>
            <h2 id="pbp-title" className="font-display text-3xl font-extrabold uppercase tracking-tight">
              Play-by-play
            </h2>
          </div>
          <p className="text-sm text-muted">
            {detail.plays.length} actions · {detail.plays.filter((p) => p.scoring).length} paniers
          </p>
        </div>

        {detail.plays.length === 0 ? (
          <p className="glass rounded-2xl p-6 text-center text-sm text-muted">
            {detail.game.status === "scheduled"
              ? "Le déroulé apparaîtra dès le coup d’envoi."
              : "Aucune action publiée pour ce match."}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="Actions affichées" className="glass flex rounded-xl p-1">
                <button type="button" aria-pressed={filtre === "tout"} className={bouton(filtre === "tout")} onClick={() => setFiltre("tout")}>
                  Toutes
                </button>
                <button
                  type="button"
                  aria-pressed={filtre === "paniers"}
                  className={bouton(filtre === "paniers")}
                  onClick={() => setFiltre("paniers")}
                >
                  Paniers
                </button>
              </div>
              <div role="group" aria-label="Période" className="glass flex flex-wrap rounded-xl p-1">
                <button
                  type="button"
                  aria-pressed={periode === "toutes"}
                  className={bouton(periode === "toutes")}
                  onClick={() => setPeriode("toutes")}
                >
                  Match
                </button>
                {periodes.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={periode === n}
                    className={bouton(periode === n)}
                    onClick={() => setPeriode(n)}
                  >
                    {periodeCourte(n)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {groupes.map(([n, plays]) => (
                <div key={n} className="glass overflow-hidden rounded-2xl">
                  <h3 className="border-b border-line bg-surface-strong/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    {periodeLongue(n)}
                  </h3>
                  <ol>
                    {plays.map((p) => (
                      <Action key={p.id} play={p} detail={detail} />
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
