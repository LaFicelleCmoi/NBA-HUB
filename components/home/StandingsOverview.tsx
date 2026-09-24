"use client";

import Link from "next/link";
import { LEAGUES } from "@/lib/leagues";
import { Logo } from "@/components/ui/Logo";
import { ZoneLegend, StandingsTables } from "@/components/standings/StandingsTable";
import { useToday } from "@/components/home/HomeLive";
import { liveCount, withLiveGames } from "@/lib/live-standings";
import type { Game, Standings } from "@/types";

/**
 * Classement complet d'une ligue : toutes les conférences et toutes les
 * équipes sont affichées en même temps (pas de sélecteur de conférence),
 * pour que l'accueil montre l'intégralité des classements.
 */
function LeaguePanel({ s, games }: { s: Standings; games: Game[] }) {
  const league = LEAGUES[s.league];
  const provisoire = withLiveGames(s, games);
  const enCours = liveCount(s, games);
  const total = provisoire.groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <article aria-labelledby={`st-${s.league}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`st-${s.league}`} className="flex items-center gap-2 font-display text-2xl font-extrabold uppercase">
          <Logo logo={league.logo} alt="" size={26} />
          {league.name}
          <span className="text-sm font-semibold normal-case text-faint">{s.season}</span>
        </h3>
        <span className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold text-muted">
          {total} équipes
        </span>
      </div>
      {s.isPreviousSeason && (
        <p className="text-xs text-playin">Inter-saison : classement final de la saison {s.season}.</p>
      )}
      {enCours > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-live">
          <span aria-hidden className="live-dot h-2 w-2 rounded-full bg-live" />
          Classement provisoire : {enCours} match{enCours > 1 ? "s" : ""} en cours pris en compte.
        </p>
      )}
      <StandingsTables standings={provisoire} />
      <ZoneLegend league={s.league} />
      <Link href={`/${s.league}`} className="text-sm font-semibold hover:underline">
        Tout le championnat {league.name} →
      </Link>
    </article>
  );
}

export function StandingsOverview({ standings }: { standings: Standings[] }) {
  // Les matchs du jour sont déjà en contexte et rafraîchis en direct : aucun
  // appel supplémentaire n'est nécessaire pour rendre le classement vivant.
  const games = useToday().leagues.flatMap((l) => l.games);
  if (!standings.length) return <p className="text-sm text-muted">Classements indisponibles pour le moment.</p>;
  return (
    <div className="space-y-12">
      {standings.map((s) => (
        <LeaguePanel key={s.league} s={s} games={games} />
      ))}
    </div>
  );
}
