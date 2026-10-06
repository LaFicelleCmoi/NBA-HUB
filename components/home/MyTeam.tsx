"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFavoriteTeam } from "@/lib/client/favorite";
import { useApi } from "@/lib/client/useApi";
import { LEAGUES } from "@/lib/leagues";
import { formatShortDay, formatTime } from "@/lib/time";
import { Countdown } from "@/components/ui/Countdown";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FavoriteTeam, Game, TeamSummary } from "@/types";

/** Un bloc de la rangée du bas, pour garder les trois encarts identiques. */
function Panel({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
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

/** Match en cours : score, temps de jeu, et lien vers la page du match. */
function LiveGame({ game, teamId }: { game: Game; teamId: string }) {
  const home = game.home.team.id === teamId;
  const nous = home ? game.home : game.away;
  const eux = home ? game.away : game.home;
  const mene = (nous.score ?? 0) > (eux.score ?? 0);
  return (
    <Link href={`/${game.league}/match/${game.id}`} className="group block" aria-live="polite">
      <p className="flex items-center gap-2 font-semibold">
        <span className="text-muted">{home ? "contre" : "chez"}</span>
        <Logo logo={eux.team.logo} alt="" size={24} className="h-6 w-6 shrink-0" />
        <span className="truncate group-hover:underline">{eux.team.name}</span>
      </p>
      <p className="mt-1 flex items-baseline gap-3">
        {/* Abréviations de part et d'autre : le score de l'équipe favorite, à gauche, se lit sans hésiter. */}
        <span className="tabular flex items-baseline gap-1.5 font-display text-3xl font-extrabold leading-none">
          <span className="font-sans text-xs font-semibold text-faint">{nous.team.abbreviation}</span>
          <span className={mene ? "" : "text-muted"}>{nous.score ?? 0}</span>
          <span className="text-faint">–</span>
          <span className={mene ? "text-muted" : ""}>{eux.score ?? 0}</span>
          <span className="font-sans text-xs font-semibold text-faint">{eux.team.abbreviation}</span>
        </span>
        <span className="text-sm font-semibold text-live">{game.statusDetail}</span>
      </p>
    </Link>
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
      {game.status === "scheduled" && (
        <div className="mt-2.5">
          <Countdown date={game.date} />
        </div>
      )}
    </>
  );
}

function Card({ favorite, data, live }: { favorite: FavoriteTeam; data: TeamSummary | null; live?: Game }) {
  const league = LEAGUES[favorite.league];
  const team = data?.team ?? { ...favorite, shortName: favorite.name, abbreviation: "", league: favorite.league };

  return (
    <section
      aria-labelledby="my-team-title"
      className="glass relative overflow-hidden rounded-3xl p-5 ring-2 ring-fav/60 sm:p-6"
    >
      {/* Filigrane : le logo en grand, effacé mais lisible, comme fond de carte.
          Décalé vers la gauche à partir de sm : collé au bord droit, il
          disparaissait derrière le bouton « Voir la fiche ». */}
      <span aria-hidden className="pointer-events-none absolute -right-6 -top-6 opacity-[0.14] sm:right-48">
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

        <Panel
          title={
            live ? (
              <span className="flex items-center gap-2 text-live">
                <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-live" />
                En direct
              </span>
            ) : (
              "Prochain match"
            )
          }
        >
          {live ? (
            <LiveGame game={live} teamId={favorite.id} />
          ) : data ? (
            <NextGame game={data.next} teamId={favorite.id} />
          ) : (
            <Skeleton className="h-9 w-48" />
          )}
        </Panel>
      </div>
    </section>
  );
}

/** Pendant un match, au plus près du direct ; à l'approche du coup d'envoi, souvent ; sinon, de loin en loin. */
const CADENCE = { direct: 15_000, approche: 30_000, repos: 5 * 60_000 };

/**
 * Match en cours de l'équipe favorite, suivi en direct.
 *
 * On interroge la liste des matchs en cours de la ligue — réponse minime,
 * déjà servie toutes les 5 s au CDN pour l'accueil — plutôt que le résumé de
 * l'équipe, dont le calendrier est mis en cache dix minutes : un coup d'envoi
 * y passerait inaperçu. La cadence s'accélère dix minutes avant l'heure
 * prévue du prochain match et pendant le match.
 */
function useLiveGame(favorite: FavoriteTeam | null, next?: Game): { live?: Game; proche: boolean } {
  const [proche, setProche] = useState(false);
  const debut = next ? Date.parse(next.date) : NaN;

  useEffect(() => {
    if (!Number.isFinite(debut)) return;
    const dans = debut - 10 * 60_000 - Date.now();
    const t = setTimeout(() => setProche(true), Math.max(0, dans));
    return () => {
      clearTimeout(t);
      setProche(false);
    };
  }, [debut]);

  const [cadence, setCadence] = useState(CADENCE.repos);
  const { data } = useApi<Game[]>(favorite ? `/api/${favorite.league}/live` : null, { refreshMs: cadence });
  const live = favorite
    ? data?.find((g) => g.home.team.id === favorite.id || g.away.team.id === favorite.id)
    : undefined;

  // Ajustement pendant le rendu, comme ailleurs : la cadence suit l'état du match.
  const voulue = live ? CADENCE.direct : proche ? CADENCE.approche : CADENCE.repos;
  if (voulue !== cadence) setCadence(voulue);
  return { live, proche };
}

/**
 * Carte « Mon équipe » de l'accueil. Le favori vit dans le navigateur : le
 * serveur ne peut pas le connaître, la carte se remplit donc côté client.
 * Elle s'affiche dès que le favori est connu, sans attendre les données —
 * nom et logo viennent déjà du stockage local.
 */
export function MyTeam() {
  const favorite = useFavoriteTeam();
  // Le résumé (forme, prochain match) se recharge chaque minute autour d'un
  // match — de l'approche du coup d'envoi jusqu'à la fin — et plus du tout
  // le reste du temps. Sans cela, un match terminé restait affiché comme
  // « prochain match » et n'entrait pas dans la forme.
  const [cadenceResume, setCadenceResume] = useState(0);
  const { data } = useApi<TeamSummary>(favorite ? `/api/${favorite.league}/teams/${favorite.id}/summary` : null, {
    refreshMs: cadenceResume,
  });
  const { live, proche } = useLiveGame(favorite, data?.next);
  const voulue = live || proche ? 60_000 : 0;
  if (voulue !== cadenceResume) setCadenceResume(voulue);
  // L'animation d'apparition est portée ici, pas par l'accueil : sans favori,
  // aucun conteneur vide ne doit laisser de marge dans la page.
  if (!favorite) return null;
  return (
    <Reveal className="mt-4">
      <Card favorite={favorite} data={data} live={live} />
    </Reveal>
  );
}
