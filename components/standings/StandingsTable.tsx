"use client";

import Link from "next/link";
import { isFavoriteTeam, useFavoriteTeam } from "@/lib/client/favorite";
import { ZONES, zoneFor } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import type { LeagueId, StandingGroup, StandingRow, Standings } from "@/types";

/** Flèche de mouvement par rapport au classement officiel. */
function Movement({ places }: { places?: number }) {
  if (!places) return null;
  const monte = places > 0;
  return (
    <span
      className={`text-[0.65rem] font-bold ${monte ? "text-direct" : "text-live"}`}
      title={`${Math.abs(places)} place${Math.abs(places) > 1 ? "s" : ""} ${monte ? "gagnée" : "perdue"}${Math.abs(places) > 1 ? "s" : ""} grâce au match en cours`}
    >
      <span aria-hidden>{monte ? "▲" : "▼"}</span>
      {Math.abs(places)}
      <span className="sr-only">
        {" "}
        place{Math.abs(places) > 1 ? "s" : ""} {monte ? "gagnée" : "perdue"}
        {Math.abs(places) > 1 ? "s" : ""}
      </span>
    </span>
  );
}
const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/**
 * Rang affiché, à égalité parfaite partagée.
 *
 * Deux équipes au même bilan et aux mêmes points portent le même numéro, et la
 * suivante reprend au rang réel (« 1, 2, 8, 8, 8, 14 ») : c'est la convention
 * des classements sportifs. En début de saison, les équipes qui n'ont pas
 * encore joué apparaissent ainsi toutes au même rang au lieu d'un ordre
 * arbitraire. L'ordre des lignes, lui, reste celui du classement officiel.
 */
function sharedRanks(rows: StandingRow[]): number[] {
  const key = (r: StandingRow) => `${r.played}|${r.wins}|${r.losses}|${r.diff}|${r.pointsFor ?? ""}`;
  const out: number[] = [];
  rows.forEach((r, i) => {
    out.push(i > 0 && key(r) === key(rows[i - 1]) ? out[i - 1] : i + 1);
  });
  return out;
}

/** Pastille du match en cours : score, puis logo de l'adversaire. */
function LivePill({ live }: { live: NonNullable<StandingRow["liveGame"]> }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${
        live.winning ? "bg-direct-bg text-direct" : "bg-live/15 text-live"
      }`}
      title={`${live.detail} · contre ${live.opponent}`}
    >
      <span aria-hidden className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
      <span className="tabular">{live.score}</span>
      <Logo logo={live.opponentLogo} alt="" size={16} className="h-4 w-4 shrink-0" />
      <span className="sr-only">
        {" "}
        en cours contre {live.opponent}, {live.detail}
      </span>
    </span>
  );
}

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

function GroupTable({ league, group, caption }: { league: LeagueId; group: StandingGroup; caption: string }) {
  const favorite = useFavoriteTeam();
  const th = "px-2 py-2 text-right font-semibold";
  const ranks = sharedRanks(group.rows);
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="scrollbar-thin relative overflow-x-auto" tabIndex={0} role="region" aria-label={caption}>
        <table className="tabular w-full min-w-[480px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="text-xs uppercase tracking-wide text-faint">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--sticky)] px-3 py-2 text-left font-semibold">
                <span aria-hidden>#</span>
                <span className="sr-only">Rang</span>
                <span className="ml-3">Équipe</span>
              </th>
              <th scope="col" className={th}>
                <abbr title="Matchs joués" className="no-underline">MJ</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Victoires" className="no-underline">V</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Défaites" className="no-underline">D</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Points marqués" className="no-underline">Pts+</abbr>
              </th>
              <th scope="col" className={th}>
                <abbr title="Points encaissés" className="no-underline">Pts-</abbr>
              </th>
              <th scope="col" className={`${th} pr-4`}>
                <abbr title="Différence de points" className="no-underline">Diff</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r, i) => {
              // Une équipe qui n'a pas encore joué n'est ni qualifiée ni en
              // play-in : lui colorer une zone serait trompeur.
              const zone = r.played > 0 ? zoneFor(league, r.seed) : undefined;
              const fav = isFavoriteTeam(favorite, league, r.team.id);
              return (
                <tr
                  key={r.team.id}
                  className={`border-b border-line last:border-0 ${
                    fav ? "bg-fav-bg" : r.liveGame ? "bg-live/[0.07]" : "hover:bg-line/40"
                  }`}
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
                        {ranks[i]}
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
                      <Movement places={r.movement} />
                      {r.liveGame && <LivePill live={r.liveGame} />}
                    </div>
                  </th>
                  <td className="px-2 py-2 text-right text-muted">{r.played}</td>
                  <td className="px-2 py-2 text-right font-semibold">{r.wins}</td>
                  <td className="px-2 py-2 text-right">{r.losses}</td>
                  <td className="px-2 py-2 text-right text-muted">{r.pointsFor ?? "–"}</td>
                  <td className="px-2 py-2 text-right text-muted">{r.pointsAgainst ?? "–"}</td>
                  <td
                    className={`px-2 py-2 pr-4 text-right font-semibold ${
                      r.diff > 0 ? "text-direct" : r.diff < 0 ? "text-live" : "text-muted"
                    }`}
                  >
                    {signed(r.diff)}
                  </td>
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

export function StandingsTables({ standings }: { standings: Standings }) {
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
            caption={`Classement ${groups.length > 1 ? `conférence ${g.name}` : g.name}, saison ${standings.season}`}
          />
        </div>
      ))}
    </div>
  );
}
