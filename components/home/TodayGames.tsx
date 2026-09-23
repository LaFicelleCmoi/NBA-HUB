"use client";

import { LEAGUES } from "@/lib/leagues";
import { formatDay, formatTime } from "@/lib/time";
import { GameCard } from "@/components/games/GameCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import type { Game, TodayResponse } from "@/types";

function NextGame({ game }: { game: Game }) {
  return (
    <p className="text-sm text-muted">
      Prochain match :{" "}
      <span className="font-semibold text-fg">
        {game.away.team.shortName} @ {game.home.team.shortName}
      </span>{" "}
      — <time dateTime={game.date}>{formatDay(game.date)} à {formatTime(game.date)}</time>
    </p>
  );
}

export function TodayGames({ today }: { today: TodayResponse }) {
  const total = today.leagues.reduce((n, l) => n + l.games.length, 0);
  const live = today.leagues.reduce((n, l) => n + l.games.filter((g) => g.status === "live").length, 0);

  if (total === 0) {
    return (
      <div className="space-y-4">
        <EmptyState title="Aucun match aujourd’hui dans les 3 ligues">
          <p>Les prochaines rencontres programmées :</p>
        </EmptyState>
        <ul className="grid gap-3 md:grid-cols-3">
          {today.leagues.map((l, i) => (
            <Reveal as="li" key={l.league} from={i % 2 ? "right" : "left"} delay={i * 0.06} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 font-display text-lg font-bold uppercase">
                <Logo logo={LEAGUES[l.league].logo} alt="" size={20} /> {LEAGUES[l.league].name}
              </p>
              {l.nextGame ? (
                <GameCard game={l.nextGame} detailed={false} showDate />
              ) : (
                <p className="glass rounded-2xl p-4 text-sm text-muted">Calendrier non publié pour le moment.</p>
              )}
            </Reveal>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <p className="sr-only" aria-live="polite">
        {live > 0 ? `${live} match${live > 1 ? "s" : ""} en cours` : ""}
      </p>
      {today.leagues.map((l) => (
        <section key={l.league} aria-labelledby={`today-${l.league}`}>
          <h3
            id={`today-${l.league}`}
            className="mb-3 flex items-center gap-2 font-display text-xl font-bold uppercase tracking-wide"
          >
            <Logo logo={LEAGUES[l.league].logo} alt="" size={22} />
            {LEAGUES[l.league].name}
            <span className="text-sm font-semibold text-faint">
              {l.games.length} match{l.games.length > 1 ? "s" : ""}
            </span>
          </h3>
          {l.games.length === 0 ? (
            l.nextGame ? <NextGame game={l.nextGame} /> : <p className="text-sm text-muted">Pas de match aujourd’hui.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {l.games.map((g, i) => (
                <Reveal as="li" key={g.id} delay={Math.min(i, 6) * 0.05}>
                  <GameCard game={g} showDate={false} />
                </Reveal>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
