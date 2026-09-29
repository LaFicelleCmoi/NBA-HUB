"use client";

import { useRef, useState } from "react";
import { isFavoriteTeam, setFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { LEAGUE_IDS, LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import type { LeagueId, Team } from "@/types";

/** Recherche tolérante : sans accents ni casse (« nimes » trouve « Nîmes »). */
const plat = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const correspond = (t: Team, q: string) =>
  [t.name, t.shortName, t.abbreviation, t.location ?? ""].some((v) => plat(v).includes(q));

/**
 * Regroupe par conférence, Ouest avant Est comme les classements. L'EuroLeague,
 * sans conférence, forme un seul groupe sans titre.
 */
function parConference(teams: Team[]): [string, Team[]][] {
  const groupes = new Map<string, Team[]>();
  for (const t of [...teams].sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
    const cle = t.conference ?? "";
    groupes.set(cle, [...(groupes.get(cle) ?? []), t]);
  }
  const rang = (c: string) => (c.startsWith("Ouest") ? 0 : c.startsWith("Est") ? 1 : 2);
  return [...groupes.entries()].sort((a, b) => rang(a[0]) - rang(b[0]));
}

function Tuile({ team, choisie, onPick, avecLigue }: { team: Team; choisie: boolean; onPick: () => void; avecLigue?: boolean }) {
  // Chaque tuile prend une teinte de la couleur du club, très diluée : la
  // grille reste sobre mais on reconnaît les équipes avant même de lire.
  const teinte = team.color ? `color-mix(in srgb, ${team.color} 22%, transparent)` : undefined;
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={choisie}
        style={teinte ? { backgroundImage: `linear-gradient(135deg, ${teinte}, transparent 70%)` } : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lg focus-visible:outline-2 focus-visible:outline-fav ${
          choisie ? "border-fav bg-fav-bg ring-2 ring-fav/60" : "border-line bg-surface"
        }`}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center">
          <Logo
            logo={team.logo}
            alt=""
            size={48}
            className="h-11 w-11 transition-transform duration-200 group-hover:scale-110"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{team.name}</span>
          <span className="block truncate text-xs text-faint">
            {avecLigue ? LEAGUES[team.league].name : team.abbreviation}
            {avecLigue && team.conference ? ` · ${team.conference}` : ""}
          </span>
        </span>
        {choisie && (
          <span aria-hidden className="text-lg text-fav">
            ★
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * Choix de l'équipe favorite : un bouton qui ouvre une fenêtre avec les
 * logos de toutes les équipes, par ligue et par conférence, et une recherche
 * qui porte sur les trois ligues à la fois. Fenêtre en <dialog> natif : focus
 * piégé, Échap et retour du focus sont gérés par le navigateur.
 */
export function FavoritePicker({ teams }: { teams: Record<LeagueId, Team[]> }) {
  const favorite = useFavoriteTeam();
  const dialog = useRef<HTMLDialogElement>(null);
  const [ligue, setLigue] = useState<LeagueId>(favorite?.league ?? "nba");
  const [recherche, setRecherche] = useState("");

  const ouvrir = () => {
    setRecherche("");
    if (favorite) setLigue(favorite.league);
    dialog.current?.showModal();
  };
  const fermer = () => dialog.current?.close();

  const choisir = (t: Team) => {
    setFavoriteTeam({ league: t.league, id: t.id, name: t.name, logo: t.logo });
    fermer();
  };

  const q = plat(recherche.trim());
  const resultats = q ? LEAGUE_IDS.flatMap((l) => (teams[l] ?? []).filter((t) => correspond(t, q))) : [];
  const favTeam = favorite ? teams[favorite.league]?.find((t) => t.id === favorite.id) : undefined;

  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <h2 className="font-display text-xl font-bold uppercase tracking-wide">Équipe favorite</h2>
        <p className="text-sm text-muted">
          {favorite
            ? `${favorite.name} est mise en avant partout sur le site.`
            : "Choisissez une équipe pour la mettre en avant partout sur le site."}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={ouvrir}
          aria-haspopup="dialog"
          className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-line-strong bg-surface-strong py-2 pl-2 pr-4 text-left transition hover:border-fav/70 hover:shadow-lg sm:w-80"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fav-bg">
            {favorite ? (
              <Logo logo={favorite.logo} alt="" size={36} className="h-9 w-9" />
            ) : (
              <span aria-hidden className="text-xl text-fav">
                ★
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{favorite?.name ?? "Choisir une équipe"}</span>
            <span className="block truncate text-xs text-faint">
              {favorite
                ? [LEAGUES[favorite.league].name, favTeam?.conference].filter(Boolean).join(" · ")
                : "NBA, WNBA ou EuroLeague"}
            </span>
          </span>
          <svg
            aria-hidden
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 text-muted transition-transform group-hover:translate-y-0.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {favorite && (
          <button
            type="button"
            onClick={() => setFavoriteTeam(null)}
            className="shrink-0 rounded-xl border border-line-strong px-3 py-2.5 text-sm font-semibold text-muted hover:text-fg"
          >
            Retirer
          </button>
        )}
      </div>

      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) fermer();
        }}
        aria-labelledby="favorite-dialog-title"
        className="m-auto h-dvh max-h-dvh w-full max-w-4xl bg-transparent p-0 text-fg backdrop:bg-black/65 backdrop:backdrop-blur-sm sm:h-[min(85dvh,52rem)] sm:p-4"
      >
        <div className="flex h-full flex-col overflow-hidden border-line bg-bg shadow-2xl sm:rounded-3xl sm:border">
          <div className="flex items-center gap-3 border-b border-line p-4 sm:p-5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-fav">★ Mon équipe</p>
              <h2 id="favorite-dialog-title" className="font-display text-2xl font-extrabold uppercase leading-tight">
                Choisir mon équipe
              </h2>
            </div>
            <button
              type="button"
              onClick={fermer}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line-strong text-muted hover:text-fg"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:p-5">
            <div role="tablist" aria-label="Ligue" className="glass flex rounded-2xl p-1">
              {LEAGUE_IDS.map((l) => {
                const actif = !q && ligue === l;
                return (
                  <button
                    key={l}
                    type="button"
                    role="tab"
                    aria-selected={actif}
                    onClick={() => {
                      setLigue(l);
                      setRecherche("");
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors sm:flex-none ${
                      actif ? "bg-surface-strong text-fg shadow-sm" : "text-muted hover:text-fg"
                    }`}
                  >
                    <Logo logo={LEAGUES[l].logo} alt="" size={20} className="h-5 w-5" />
                    {LEAGUES[l].name}
                    <span className="tabular text-xs text-faint">{teams[l]?.length ?? 0}</span>
                  </button>
                );
              })}
            </div>
            <label className="relative flex-1">
              <span className="sr-only">Rechercher une équipe</span>
              <svg
                aria-hidden
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher dans les trois ligues…"
                className="w-full rounded-2xl border border-line-strong bg-surface-strong py-2.5 pl-9 pr-3 text-sm placeholder:text-faint focus-visible:outline-2 focus-visible:outline-fav"
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {q ? (
              resultats.length ? (
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {resultats.map((t) => (
                    <Tuile
                      key={`${t.league}:${t.id}`}
                      team={t}
                      avecLigue
                      choisie={isFavoriteTeam(favorite, t.league, t.id)}
                      onPick={() => choisir(t)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-12 text-center text-sm text-muted">Aucune équipe ne correspond à « {recherche} ».</p>
              )
            ) : (
              <div className="space-y-6">
                {parConference(teams[ligue] ?? []).map(([conf, liste]) => (
                  <section key={conf || "toutes"}>
                    {conf && (
                      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-faint">
                        Conférence {conf}
                      </h3>
                    )}
                    <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {liste.map((t) => (
                        <Tuile
                          key={t.id}
                          team={t}
                          choisie={isFavoriteTeam(favorite, t.league, t.id)}
                          onPick={() => choisir(t)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
