"use client";

import Link from "next/link";
import { useIsFavorite } from "@/lib/client/favorite";
import { LEAGUES } from "@/lib/leagues";
import { formatShortDay, formatTime } from "@/lib/time";
import { Logo } from "@/components/ui/Logo";
import type { Game, GameTeam } from "@/types";

export function StatusPill({ game }: { game: Game }) {
  if (game.status === "live")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-live">
        <span aria-hidden className="live-dot h-2 w-2 rounded-full bg-live" />
        En direct<span className="sr-only"> :</span>
        <span className="font-semibold normal-case tracking-normal">{game.statusDetail}</span>
      </span>
    );
  if (game.status === "final")
    return (
      <span className="rounded-full bg-line px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {game.statusDetail}
      </span>
    );
  if (game.status === "postponed")
    return (
      <span className="rounded-full bg-playin-bg px-2.5 py-1 text-xs font-semibold uppercase text-playin">Reporté</span>
    );
  return (
    <span className="rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-fg">
      À venir · <time dateTime={game.date}>{formatTime(game.date)}</time>
    </span>
  );
}

function TeamLine({ side, game, fav }: { side: GameTeam; game: Game; fav: boolean }) {
  const lost = game.status === "final" && !side.winner;
  const linkable = side.team.id !== "0";
  const name = (
    <span className={`truncate font-semibold ${lost ? "text-muted" : ""}`}>
      <span className="sm:hidden">{side.team.shortName}</span>
      <span className="hidden sm:inline">{side.team.name}</span>
    </span>
  );
  return (
    <div className="flex items-center gap-3">
      <Logo logo={side.team.logo} alt="" size={32} className="h-8 w-8 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {linkable ? (
          <Link href={`/${game.league}/equipe/${side.team.id}`} className="min-w-0 truncate hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
        {fav && (
          <span className="text-fav" aria-label="Équipe favorite" title="Équipe favorite">
            ★
          </span>
        )}
        {side.record && <span className="hidden text-xs text-faint sm:inline">({side.record})</span>}
      </div>
      <span
        className={`tabular font-display text-2xl font-bold ${side.winner ? "" : game.status === "final" ? "text-muted" : ""}`}
      >
        {side.score ?? "–"}
      </span>
    </div>
  );
}

function PeriodTable({ game }: { game: Game }) {
  const n = Math.max(game.home.periods.length, game.away.periods.length);
  if (n === 0) return null;
  const label = (i: number) => (i < 4 ? `Q${i + 1}` : n - 4 > 1 ? `P${i - 3}` : "Prol.");
  const title = (i: number) =>
    i === 0 ? "1er quart-temps" : i < 4 ? `${i + 1}e quart-temps` : `Prolongation ${i - 3}`;
  const rows: [string, GameTeam][] = [
    [game.away.team.abbreviation || game.away.team.shortName, game.away],
    [game.home.team.abbreviation || game.home.team.shortName, game.home],
  ];
  return (
    <div className="scrollbar-thin relative -mx-1 mt-3 overflow-x-auto px-1">
      <table className="tabular w-full min-w-[260px] text-center text-xs">
        <caption className="sr-only">Score par quart-temps{n > 4 ? " et prolongation" : ""}</caption>
        <thead>
          <tr className="text-faint">
            <th scope="col" className="py-1 text-left font-medium">
              <span className="sr-only">Équipe</span>
            </th>
            {Array.from({ length: n }, (_, i) => (
              <th key={i} scope="col" className={`py-1 font-medium ${i >= 4 ? "text-playin" : ""}`}>
                <abbr title={title(i)} className="no-underline">
                  {label(i)}
                </abbr>
              </th>
            ))}
            <th scope="col" className="py-1 font-semibold text-muted">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([abbr, s]) => (
            <tr key={abbr} className="border-t border-line">
              <th scope="row" className="py-1 text-left font-semibold">
                {abbr}
              </th>
              {Array.from({ length: n }, (_, i) => (
                <td key={i} className="py-1 text-muted">
                  {s.periods[i] ?? "–"}
                </td>
              ))}
              <td className="py-1 font-bold">{s.score ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GameCard({
  game,
  detailed = true,
  showLeague = false,
  showDate = false,
}: {
  game: Game;
  detailed?: boolean;
  showLeague?: boolean;
  showDate?: boolean;
}) {
  const favHome = useIsFavorite(game.league, game.home.team.id);
  const favAway = useIsFavorite(game.league, game.away.team.id);
  const fav = favHome || favAway;
  const league = LEAGUES[game.league];

  return (
    <article
      aria-label={`${game.away.team.name} contre ${game.home.team.name}`}
      className={`glass relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-4 transition-shadow ${
        fav ? "ring-2 ring-fav/70" : ""
      } ${game.status === "live" ? "shadow-[0_0_0_1px_var(--live)]" : ""}`}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-0.5" style={{ background: `var(--${game.league})` }} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
        <span className="flex min-w-0 items-center gap-2">
          {showLeague && (
            <span className="flex items-center gap-1 font-semibold text-muted">
              <Logo logo={league.logo} alt="" size={16} />
              {league.name}
            </span>
          )}
          {(game.phase || game.round) && <span className="truncate">{game.phase ?? game.round}</span>}
        </span>
        <StatusPill game={game} />
      </div>

      <div className="space-y-2">
        <TeamLine side={game.away} game={game} fav={favAway} />
        <TeamLine side={game.home} game={game} fav={favHome} />
      </div>

      {detailed && game.status !== "scheduled" && <PeriodTable game={game} />}

      {(showDate || game.venue) && (
        <p className="mt-auto flex flex-wrap gap-x-2 border-t border-line pt-2 text-xs text-faint">
          {showDate && (
            <time dateTime={game.date}>
              {formatShortDay(game.date)} · {formatTime(game.date)}
            </time>
          )}
          {game.venue && <span className="truncate">{game.venue}</span>}
        </p>
      )}
    </article>
  );
}
