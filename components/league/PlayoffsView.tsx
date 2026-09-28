"use client";

import Link from "next/link";
import { isFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { formatShortDay, formatTime } from "@/lib/time";
import { Logo } from "@/components/ui/Logo";
import type { Game, PlayoffSeries, Playoffs, Team } from "@/types";

const STATUT: Record<PlayoffSeries["status"], { texte: string; classe: string }> = {
  scheduled: { texte: "À venir", classe: "border border-line-strong text-muted" },
  ongoing: { texte: "En cours", classe: "bg-playin-bg text-playin" },
  live: { texte: "En direct", classe: "bg-live/15 text-live" },
  final: { texte: "Terminée", classe: "bg-line text-muted" },
};

function LigneEquipe({ team, wins, gagnant, perdant }: { team: Team | null; wins: number; gagnant: boolean; perdant: boolean }) {
  const favorite = useFavoriteTeam();
  const fav = team ? isFavoriteTeam(favorite, team.league, team.id) : false;
  return (
    <div className={`flex items-center gap-2.5 ${perdant ? "opacity-55" : ""}`}>
      {team ? (
        <Logo logo={team.logo} alt="" size={26} className="h-6.5 w-6.5 shrink-0" />
      ) : (
        <span aria-hidden className="grid h-6.5 w-6.5 shrink-0 place-items-center rounded-full bg-line text-[0.6rem] font-bold text-faint">
          ?
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-sm ${gagnant ? "font-bold" : "font-medium"}`}>
        {team ? (
          <Link href={`/${team.league}/equipe/${team.id}`} className="hover:underline">
            {team.name}
          </Link>
        ) : (
          <span className="text-faint">À déterminer</span>
        )}
        {fav && (
          <span className="ml-1 text-fav" aria-label="Équipe favorite">
            ★
          </span>
        )}
      </span>
      <span className={`tabular font-display text-2xl leading-none ${gagnant ? "font-extrabold" : "font-bold text-muted"}`}>
        {wins}
      </span>
    </div>
  );
}

function ResultatMatch({ game, numero }: { game: Game; numero: number }) {
  const joue = game.status === "final" || game.status === "live";
  return (
    <li className="flex items-center gap-2 text-xs">
      <span className="w-14 shrink-0 text-faint">Match {numero}</span>
      {joue ? (
        <Link href={`/${game.league}/match/${game.id}`} className={`tabular flex-1 hover:underline ${game.status === "live" ? "font-semibold text-live" : ""}`}>
          {game.away.team.abbreviation || game.away.team.shortName} {game.away.score} – {game.home.score}{" "}
          {game.home.team.abbreviation || game.home.team.shortName}
          {game.status === "live" && " · en direct"}
        </Link>
      ) : (
        <span className="flex-1 text-faint">
          <time dateTime={game.date}>
            {formatShortDay(game.date)} · {formatTime(game.date)}
          </time>
        </span>
      )}
    </li>
  );
}

function Serie({ serie }: { serie: PlayoffSeries }) {
  const [a, b] = serie.teams;
  const statut = STATUT[serie.status];
  const decidee = Boolean(serie.winner);
  const vainqueur = serie.teams.find((t) => t?.id === serie.winner);
  return (
    <article
      className={`glass flex flex-col gap-3 rounded-2xl p-4 ${serie.status === "live" ? "ring-1 ring-live/60" : ""}`}
      aria-label={`${a?.name ?? "À déterminer"} contre ${b?.name ?? "À déterminer"}`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate font-semibold uppercase tracking-wide text-faint">{serie.label ?? ""}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 font-semibold ${statut.classe}`}>{statut.texte}</span>
      </div>
      <div className="space-y-2">
        <LigneEquipe team={a} wins={serie.wins[0]} gagnant={serie.winner === a?.id} perdant={decidee && serie.winner !== a?.id} />
        <LigneEquipe team={b} wins={serie.wins[1]} gagnant={serie.winner === b?.id} perdant={decidee && serie.winner !== b?.id} />
      </div>
      <p className="text-xs text-muted">
        {serie.bestOf === 1 ? "Match sec" : `Au meilleur des ${serie.bestOf} matchs`}
        {/* « Remporte » et non « qualifié » : au dernier tour, le vainqueur ne se
            qualifie pour rien, il est champion. */}
        {vainqueur &&
          (serie.bestOf > 1 ? (
            <>
              {` · ${vainqueur.shortName} remporte la série `}
              <span className="whitespace-nowrap">
                {Math.max(...serie.wins)}-{Math.min(...serie.wins)}
              </span>
            </>
          ) : (
            ` · ${vainqueur.shortName} l’emporte`
          ))}
      </p>
      {serie.games.length > 0 && (
        <details className="group border-t border-line pt-2">
          <summary className="cursor-pointer list-none text-xs font-semibold text-muted hover:text-fg">
            <span className="group-open:hidden">
              {serie.games.length === 1 ? "Voir le match" : `Voir les ${serie.games.length} matchs`} ▾
            </span>
            <span className="hidden group-open:inline">
              {serie.games.length === 1 ? "Masquer le match" : "Masquer les matchs"} ▴
            </span>
          </summary>
          <ol className="mt-2 space-y-1.5">
            {serie.games.map((g, i) => (
              <ResultatMatch key={g.id} game={g} numero={i + 1} />
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

/**
 * Tableau de phase finale d'une ligue : chaque tour dans l'ordre, du play-in à
 * la finale, et le champion en tête une fois connu.
 */
export function PlayoffsView({ data }: { data: Playoffs }) {
  if (data.rounds.length === 0) {
    return (
      <p className="glass rounded-2xl p-6 text-center text-sm text-muted">
        {data.note ?? "Aucune phase finale à afficher pour le moment."}
      </p>
    );
  }
  return (
    <div className="space-y-10">
      {data.champion ? (
        <div className="glass flex items-center gap-4 rounded-3xl p-5 ring-2 ring-fav/60">
          <Logo logo={data.champion.logo} alt="" size={64} className="h-16 w-16 shrink-0" />
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-fav">Champion {data.season}</p>
            <p className="font-display text-3xl font-extrabold uppercase leading-tight">{data.champion.name}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Phase finale {data.season} en cours.</p>
      )}

      {data.rounds.map((tour) => (
        <section key={tour.name} aria-labelledby={`tour-${tour.name}`}>
          <h3
            id={`tour-${tour.name}`}
            className="mb-3 border-b border-line pb-2 font-display text-xl font-bold uppercase tracking-wide"
          >
            {tour.name}
            <span className="ml-2 font-sans text-xs font-semibold normal-case tracking-normal text-faint">
              {tour.series.length} {tour.series.length > 1 ? "séries" : "série"}
            </span>
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tour.series.map((s) => (
              <Serie key={s.id} serie={s} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
