"use client";

import Link from "next/link";
import { useFavoriteTeam } from "@/lib/client/favorite";
import { useApi } from "@/lib/client/useApi";
import { LEAGUES } from "@/lib/leagues";
import { formatShortDay, formatTime } from "@/lib/time";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FavoriteTeam, Game, TeamSummary } from "@/types";

/** Un bloc de la rangée du bas, pour garder les trois encarts identiques. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-strong/60 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}

/** « 1er », « 2e », « 15e ». */
const ordinal = (n: number) => `${n}${n === 1 ? "er" : "e"}`;

/** Cinq dernières rencontres, de la plus ancienne à la plus récente. */
function Form({ games, teamId }: { games: Game[]; teamId: string }) {
  if (games.length === 0) return <p className="text-sm text-muted">Pas encore de match joué.</p>;
  // `recent` arrive du plus récent au plus ancien : on lit une forme de gauche à droite.
  const ordered = [...games].reverse();
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ordered.map((g, i) => {
        const home = g.home.team.id === teamId;
        const us = home ? g.home : g.away;
        const them = home ? g.away : g.home;
        const won = us.winner;
        const last = i === ordered.length - 1;
        return (
          <li key={g.id}>
            <span
              title={`${won ? "Victoire" : "Défaite"} ${us.score}-${them.score} ${home ? "contre" : "chez"} ${them.team.name}`}
              className={`grid h-9 w-9 place-items-center rounded-lg text-sm font-bold ${
                won ? "bg-direct-bg text-direct" : "bg-live/15 text-live"
              } ${last ? "ring-2 ring-fav/70" : ""}`}
            >
              {won ? "V" : "D"}
              <span className="sr-only">
                {" "}
                {us.score}-{them.score} {home ? "contre" : "chez"} {them.team.name}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NextGame({ game, teamId }: { game?: Game; teamId: string }) {
  if (!game) return <p className="text-sm text-muted">Aucun match programmé pour le moment.</p>;
  const home = game.home.team.id === teamId;
  const them = home ? game.away.team : game.home.team;
  return (
    <>
      <p className="flex items-center gap-2 font-semibold">
        <span className="text-muted">{home ? "contre" : "chez"}</span>
        <Logo logo={them.logo} alt="" size={24} className="h-6 w-6 shrink-0" />
        <span className="truncate">{them.name}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        <time dateTime={game.date}>
          {formatShortDay(game.date)} · {formatTime(game.date)}
        </time>
        {game.phase && ` · ${game.phase}`}
      </p>
    </>
  );
}

function Card({ favorite, data }: { favorite: FavoriteTeam; data: TeamSummary | null }) {
  const league = LEAGUES[favorite.league];
  const team = data?.team ?? { ...favorite, shortName: favorite.name, abbreviation: "", league: favorite.league };

  return (
    <section
      aria-labelledby="my-team-title"
      className="glass relative overflow-hidden rounded-3xl p-5 ring-2 ring-fav/60 sm:p-6"
    >
      {/* Filigrane : le logo en grand, très effacé, comme fond de carte. */}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 opacity-[0.06]">
        <Logo logo={team.logo} alt="" size={240} className="h-56 w-56" />
      </span>

      <div className="relative flex flex-wrap items-center gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-fav-bg ring-1 ring-fav/50">
          <Logo logo={team.logo} alt="" size={52} className="h-13 w-13" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-fav">
            <span aria-hidden>★</span> Mon équipe
          </p>
          <h2 id="my-team-title" className="truncate font-display text-3xl font-extrabold uppercase sm:text-4xl">
            {team.name}
          </h2>
          <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
            <Logo logo={league.logo} alt="" size={18} className="h-4.5 w-4.5" />
            {league.name}
            {data?.groupName && league.conferences.length > 0 && ` · Conférence ${data.groupName}`}
          </p>
        </div>
        <Link
          href={`/${favorite.league}/equipe/${favorite.id}`}
          className="w-full shrink-0 rounded-xl bg-fg px-4 py-2.5 text-center text-sm font-semibold text-bg hover:opacity-90 sm:w-auto"
        >
          Voir la fiche
        </Link>
      </div>

      <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
        <Panel title="Classement">
          {data?.rank ? (
            <>
              <p className="font-display text-3xl font-extrabold leading-none">
                {ordinal(data.rank)}
                <span className="ml-2 font-sans text-sm font-normal text-muted">sur {data.groupSize}</span>
              </p>
              <p className="mt-1 text-sm text-muted">
                {data.wins}-{data.losses} · {data.played} matchs
                {data.isPreviousSeason && ` · saison ${data.season}`}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Classement indisponible.</p>
          )}
        </Panel>

        <Panel title="Forme">
          {data ? <Form games={data.recent} teamId={favorite.id} /> : <Skeleton className="h-9 w-48" />}
        </Panel>

        <Panel title="Prochain match">
          {data ? <NextGame game={data.next} teamId={favorite.id} /> : <Skeleton className="h-9 w-48" />}
        </Panel>
      </div>
    </section>
  );
}

/**
 * Carte « Mon équipe » de l'accueil. Le favori vit dans le navigateur : le
 * serveur ne peut pas le connaître, la carte se remplit donc côté client.
 * Elle s'affiche dès que le favori est connu, sans attendre les données —
 * nom et logo viennent déjà du stockage local.
 */
export function MyTeam() {
  const favorite = useFavoriteTeam();
  const { data } = useApi<TeamSummary>(
    favorite ? `/api/${favorite.league}/teams/${favorite.id}/summary` : null,
  );
  // L'animation d'apparition est portée ici, pas par l'accueil : sans favori,
  // aucun conteneur vide ne doit laisser de marge dans la page.
  if (!favorite) return null;
  return (
    <Reveal className="mt-4">
      <Card favorite={favorite} data={data} />
    </Reveal>
  );
}
