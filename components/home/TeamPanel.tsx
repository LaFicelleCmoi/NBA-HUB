"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useApi } from "@/lib/client/useApi";
import { useFavorite } from "@/lib/client/favorite";
import { formatShortDay } from "@/lib/time";
import { Logo } from "@/components/ui/Logo";
import { SkeletonList } from "@/components/ui/Skeleton";
import type { Game, Team } from "@/types";

function ResultRow({ game, teamId }: { game: Game; teamId: string }) {
  const home = game.home.team.id === teamId;
  const us = home ? game.home : game.away;
  const them = home ? game.away : game.home;
  const won = us.winner;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line p-3">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${
          won ? "bg-direct-bg text-direct" : "bg-live/15 text-live"
        }`}
        aria-label={won ? "Victoire" : "Défaite"}
      >
        {won ? "V" : "D"}
      </span>
      <Logo logo={them.team.logo} alt="" size={28} className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">
          {home ? "vs" : "@"} {them.team.name}
        </p>
        <p className="text-xs text-faint">
          <time dateTime={game.date}>{formatShortDay(game.date)}</time>
          {game.statusDetail.includes("prol") && " · après prolongation"}
        </p>
      </div>
      <span className="tabular font-display text-xl font-bold">
        {us.score}–{them.score}
      </span>
    </li>
  );
}

/** Panneau modal (élément <dialog> natif : focus piégé, Échap, retour du focus). */
export function TeamPanel({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { data, error, loading } = useApi<Game[]>(team ? `/api/${team.league}/teams/${team.id}/recent` : null);
  const { isFavorite, setFavorite } = useFavorite();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (team && !d.open) d.showModal();
    if (!team && d.open) d.close();
  }, [team]);

  const fav = team ? isFavorite(team.league, team.id) : false;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="team-panel-title"
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {team && (
        <div className="flex h-full flex-col gap-5 overflow-y-auto border-l border-line bg-bg p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <Logo logo={team.logo} alt="" size={64} className="h-16 w-16 shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="team-panel-title" className="font-display text-2xl font-extrabold uppercase leading-tight">
                {team.name}
              </h2>
              {team.location && <p className="text-sm text-muted">{team.location}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-strong text-muted hover:text-fg"
              aria-label="Fermer le panneau"
            >
              ✕
            </button>
          </div>

          <section aria-labelledby="recent-title">
            <h3 id="recent-title" className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted">
              5 derniers matchs
            </h3>
            {loading && <SkeletonList rows={5} className="h-14" />}
            {error && <p className="text-sm text-live">{error}</p>}
            {data && data.length === 0 && <p className="text-sm text-muted">Aucun match joué récemment.</p>}
            {data && data.length > 0 && (
              <ul className="space-y-2">
                {data.map((g) => (
                  <ResultRow key={g.id} game={g} teamId={team.id} />
                ))}
              </ul>
            )}
          </section>

          <div className="mt-auto flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/${team.league}/equipe/${team.id}`}
              className="flex-1 rounded-xl bg-fg px-4 py-3 text-center text-sm font-semibold text-bg hover:opacity-90"
            >
              Page de l’équipe
            </Link>
            <button
              type="button"
              aria-pressed={fav}
              onClick={() =>
                setFavorite(fav ? null : { league: team.league, id: team.id, name: team.name, logo: team.logo })
              }
              className="flex-1 rounded-xl border border-line-strong px-4 py-3 text-sm font-semibold hover:bg-line/50"
            >
              <span className="text-fav" aria-hidden>
                {fav ? "★" : "☆"}
              </span>{" "}
              {fav ? "Équipe favorite" : "Définir comme favorite"}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
