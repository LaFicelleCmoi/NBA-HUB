"use client";

import Link from "next/link";
import { isFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { ZONES, zoneFor } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import type { LeagueId, StandingGroup, Standings } from "@/types";

const pct = (v: number) => (v >= 1 ? "1.000" : v.toFixed(3).replace(/^0/, ""));
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

export function ZoneLegend({ league }: { league: LeagueId }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Légende des zones">
      {ZONES[league].map((z) => (
        <li key={z.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`h-3 w-1.5 rounded-full ${z.tone === "direct" ? "bg-direct" : "bg-playin"}`}
          />
          {z.from}–{z.to} : {z.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="text-fav">
          ★
        </span>
        Équipe favorite
      </li>
    </ul>
  );
}

function GroupTable({
  league,
  group,
  showStreak,
  caption,
}: {
  league: LeagueId;
  group: StandingGroup;
  showStreak: boolean;
  caption: string;
}) {
  const favorite = useFavoriteTeam();
  const th = "px-2 py-2 text-right font-semibold";
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="scrollbar-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
        <table className="tabular w-full min-w-[440px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                <span aria-hidden>#</span>
                <span className="sr-only">Rang</span>
                <span className="ml-3">Équipe</span>
              </th>
              <th scope="col" className={th}>
                <abbr title="Matchs joués" className="no-underline">J</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Victoires" className="no-underline">V</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Défaites" className="no-underline">D</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Pourcentage de victoires" className="no-underline">%V</abbr>
              </th>
              <th scope="col" className={`${th} ${showStreak ? "" : "pr-4"}`}>
                <abbr title="Différence de points" className="no-underline">Diff</abbr>
              </th>
              {showStreak && (
                <th scope="col" className={`${th} pr-4`}>
                  Série
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => {
              const zone = zoneFor(league, r.seed);
              const fav = isFavoriteTeam(favorite, league, r.team.id);
              return (
                <tr
                  key={r.team.id}
                  className={`border-b border-line last:border-0 ${fav ? "bg-fav-bg" : "hover:bg-line/40"}`}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 px-3 py-2 text-left font-normal"
                    style={{
                      // Fond opaque pour masquer les colonnes qui défilent dessous.
                      background: fav ? "linear-gradient(var(--fav-bg), var(--fav-bg)), var(--sticky)" : "var(--sticky)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid h-6 w-7 shrink-0 place-items-center rounded-md text-xs font-bold ${
                          zone?.tone === "direct"
                            ? "bg-direct-bg text-direct"
                            : zone?.tone === "playin"
                              ? "bg-playin-bg text-playin"
                              : "text-faint"
                        }`}
                        title={zone?.label}
                      >
                        {r.rank}
                        {zone && <span className="sr-only"> — {zone.label}</span>}
                      </span>
                      <Logo logo={r.team.logo} alt="" size={24} className="h-6 w-6 shrink-0" />
                      <Link
                        href={`/${league}/equipe/${r.team.id}`}
                        className="max-w-[9.5rem] truncate font-semibold hover:underline sm:max-w-none"
                      >
                        <span className="sm:hidden">{r.team.shortName}</span>
                        <span className="hidden sm:inline">{r.team.name}</span>
                      </Link>
                      {fav && (
                        <span className="text-fav" aria-label="Équipe favorite">
                          ★
                        </span>
                      )}
                    </div>
                  </th>
                  <td className="px-2 py-2 text-right text-muted">{r.played}</td>
                  <td className="px-2 py-2 text-right font-semibold">{r.wins}</td>
                  <td className="px-2 py-2 text-right">{r.losses}</td>
                  <td className="px-2 py-2 text-right">{pct(r.winPct)}</td>
                  <td
                    className={`px-2 py-2 text-right ${showStreak ? "" : "pr-4"} ${
                      r.diff > 0 ? "text-direct" : r.diff < 0 ? "text-live" : "text-muted"
                    }`}
                  >
                    {signed(r.diff)}
                  </td>
                  {showStreak && <td className="px-2 py-2 pr-4 text-right text-muted">{r.streak ?? "–"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Ordre d'affichage des conférences : Ouest à gauche, Est à droite.
 *
 * C'est un choix de présentation, pas de données : il est appliqué ici plutôt
 * que dans la normalisation, pour valoir aussi bien sur la page d'un
 * championnat que sur l'accueil, et sans dépendre de l'ordre renvoyé par
 * l'amont ni de celui du relevé versionné.
 */
const CONFERENCE_ORDER = ["Ouest", "Est"];

const byConference = (a: StandingGroup, b: StandingGroup) => {
  const rank = (name: string) => {
    const i = CONFERENCE_ORDER.indexOf(name);
    // Un groupe non listé (tableau unique de l'EuroLeague) garde sa place.
    return i === -1 ? CONFERENCE_ORDER.length : i;
  };
  return rank(a.name) - rank(b.name);
};

export function StandingsTables({ standings, showStreak = false }: { standings: Standings; showStreak?: boolean }) {
  const { league } = standings;
  const groups = [...standings.groups].sort(byConference);
  return (
    <div className={`grid gap-4 ${groups.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {groups.map((g) => (
        <div key={g.name} className="min-w-0">
          {groups.length > 1 && (
            <h3 className="mb-2 font-display text-lg font-bold uppercase tracking-wide text-muted">
              Conférence {g.name}
            </h3>
          )}
          <GroupTable
            league={league}
            group={g}
            showStreak={showStreak}
            caption={`Classement ${groups.length > 1 ? `conférence ${g.name}` : g.name}, saison ${standings.season}`}
          />
        </div>
      ))}
    </div>
  );
}
