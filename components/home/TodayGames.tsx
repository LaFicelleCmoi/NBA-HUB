"use client";

import Link from "next/link";
import { LEAGUES } from "@/lib/leagues";
import { formatDay, parisDayKey } from "@/lib/time";
import { GameCard } from "@/components/games/GameCard";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import type { Game, TodayLeague, TodayResponse } from "@/types";

function GameGrid({ games, detailed = true, showDate = false }: { games: Game[]; detailed?: boolean; showDate?: boolean }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {games.map((g, i) => (
        <Reveal as="li" key={g.id} delay={Math.min(i, 6) * 0.05}>
          <GameCard game={g} detailed={detailed} showDate={showDate} />
        </Reveal>
      ))}
    </ul>
  );
}

function SubHeading({ title, date, href, linkLabel }: { title: string; date?: string; href: string; linkLabel: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-muted">
        {title}
        {date && <span className="font-normal normal-case text-faint"> · {formatDay(date)}</span>}
      </h4>
      <Link href={href} className="text-sm font-semibold hover:underline">
        {linkLabel} →
      </Link>
    </div>
  );
}

/** Ligue sans match aujourd'hui : dernière journée jouée + prochaine journée. */
function NoGameToday({ l }: { l: TodayLeague }) {
  const last = l.lastGames ?? [];
  const next = l.nextGames?.length ? l.nextGames : l.nextGame ? [l.nextGame] : [];
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Pas de match aujourd’hui.</p>
      {last.length > 0 && (
        <div>
          <SubHeading title="Derniers résultats" href={`/${l.league}#resultats`} linkLabel="Tous les résultats" />
          <GameGrid games={last.slice(0, 6)} showDate />
        </div>
      )}
      {next.length > 0 ? (
        <div>
          <SubHeading
            title="Prochains matchs"
            date={next.every((g) => parisDayKey(g.date) === parisDayKey(next[0].date)) ? next[0].date : undefined}
            href={`/${l.league}#calendrier`}
            linkLabel="Tout le calendrier"
          />
          <GameGrid games={next.slice(0, 6)} detailed={false} showDate />
        </div>
      ) : (
        <p className="glass rounded-2xl p-4 text-sm text-muted">
          Le calendrier de la prochaine saison n’est pas encore publié.
        </p>
      )}
    </div>
  );
}

export function TodayGames({ today }: { today: TodayResponse }) {
  const total = today.leagues.reduce((n, l) => n + l.games.length, 0);
  const live = today.leagues.reduce((n, l) => n + l.games.filter((g) => g.status === "live").length, 0);

  return (
    <div className="space-y-12">
      <p className="sr-only" aria-live="polite">
        {live > 0 ? `${live} match${live > 1 ? "s" : ""} en cours` : ""}
      </p>
      {total === 0 && (
        <p className="glass rounded-2xl px-4 py-3 text-center font-display text-lg font-bold uppercase tracking-wide">
          Aucun match aujourd’hui dans les 3 ligues
          <span className="block font-sans text-sm font-normal normal-case tracking-normal text-muted">
            Voici les derniers résultats et les prochaines rencontres.
          </span>
        </p>
      )}
      {today.leagues.map((l) => (
        <section key={l.league} aria-labelledby={`today-${l.league}`}>
          <h3
            id={`today-${l.league}`}
            className="mb-4 flex items-center gap-2 border-b border-line pb-2 font-display text-2xl font-bold uppercase tracking-wide"
          >
            <Logo logo={LEAGUES[l.league].logo} alt="" size={24} />
            {LEAGUES[l.league].name}
            {l.games.length > 0 && (
              <span className="rounded-full bg-line px-2 py-0.5 font-sans text-xs font-semibold normal-case tracking-normal text-muted">
                {l.games.length} match{l.games.length > 1 ? "s" : ""} aujourd’hui
              </span>
            )}
          </h3>
          {l.games.length > 0 ? <GameGrid games={l.games} /> : <NoGameToday l={l} />}
        </section>
      ))}
    </div>
  );
}
