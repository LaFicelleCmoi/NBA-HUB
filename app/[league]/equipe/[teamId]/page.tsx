import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTeamDetail, getTeams } from "@/lib/data";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { parseTeamId, ValidationError } from "@/lib/validation";
import { GameCard } from "@/components/games/GameCard";
import { FavoriteButton } from "@/components/team/FavoriteButton";
import { RosterTable } from "@/components/team/RosterTable";
import { EmptyState, ErrorState } from "@/components/ui/EmptyState";
import { Logo } from "@/components/ui/Logo";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LeagueId, TeamDetail } from "@/types";

type Props = { params: Promise<{ league: string; teamId: string }> };

/**
 * Validation (liste blanche, via la liste des équipes en cache) AVANT toute
 * frontière Suspense, pour que les identifiants inconnus renvoient un vrai 404.
 */
async function validate(league: string, teamId: string): Promise<{ l: LeagueId; id: string } | null> {
  if (!isLeagueId(league)) notFound();
  try {
    return { l: league, id: await parseTeamId(league, teamId) };
  } catch (err) {
    if (err instanceof ValidationError) notFound();
    return null; // API amont indisponible
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, teamId } = await params;
  if (!isLeagueId(league)) return {};
  const team = (await getTeams(league).catch(() => [])).find((t) => t.id === teamId);
  return team
    ? {
        title: `${team.name} (${LEAGUES[league].name})`,
        description: `Effectif, résultats, calendrier et statistiques de ${team.name}.`,
      }
    : {};
}

function TeamSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-8">
      <span className="sr-only">Chargement de l’équipe…</span>
      <Skeleton className="h-48 w-full rounded-3xl" />
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default async function TeamPage({ params }: Props) {
  const { league, teamId } = await params;
  const valid = await validate(league, teamId);
  if (!valid) return <ErrorState message="Impossible de charger cette équipe" />;
  return (
    <Suspense fallback={<TeamSkeleton />}>
      <TeamContent l={valid.l} id={valid.id} />
    </Suspense>
  );
}

async function TeamContent({ l, id }: { l: LeagueId; id: string }) {
  const detail: TeamDetail | null = await getTeamDetail(l, id).catch(() => null);
  const leagueInfo = LEAGUES[l];

  if (!detail) return <ErrorState message="Impossible de charger cette équipe" />;
  const { team } = detail;

  return (
    <>
      <nav aria-label="Fil d’Ariane" className="mb-4 text-sm text-faint">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Accueil
            </Link>{" "}
            /
          </li>
          <li>
            <Link href={`/${l}`} className="hover:underline">
              {leagueInfo.name}
            </Link>{" "}
            /
          </li>
          <li aria-current="page" className="text-muted">
            {team.name}
          </li>
        </ol>
      </nav>

      <section
        aria-labelledby="team-title"
        className="relative overflow-hidden rounded-3xl p-6 sm:p-10"
        style={{
          background: `linear-gradient(120deg, color-mix(in srgb, ${team.color ?? `var(--${l})`} 35%, transparent), color-mix(in srgb, var(--${l}) 12%, transparent))`,
        }}
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <Logo logo={team.logo} alt={`Logo ${team.name}`} size={120} className="h-24 w-24 sm:h-32 sm:w-32" priority />
          <div className="flex-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              <Logo logo={leagueInfo.logo} alt="" size={16} /> {leagueInfo.name}
              {team.conference && ` · Conférence ${team.conference}`}
            </p>
            <h1 id="team-title" className="font-display text-4xl font-extrabold uppercase leading-none sm:text-6xl">
              {team.name}
            </h1>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {detail.standingSummary && (
                <div className="flex gap-1">
                  <dt className="text-muted">Classement :</dt>
                  <dd className="font-semibold">{detail.standingSummary}</dd>
                </div>
              )}
              {detail.coach && (
                <div className="flex gap-1">
                  <dt className="text-muted">Entraîneur :</dt>
                  <dd className="font-semibold">{detail.coach}</dd>
                </div>
              )}
              {team.location && (
                <div className="flex gap-1">
                  <dt className="text-muted">Ville :</dt>
                  <dd className="font-semibold">{team.location}</dd>
                </div>
              )}
            </dl>
          </div>
          <FavoriteButton team={team} />
        </div>
      </section>

      <div className="mt-14 grid gap-14 lg:grid-cols-2 lg:gap-8">
        <Reveal from="left" as="section">
          <SectionHeading id="recent" kicker={`Saison ${detail.season}`} title="Derniers résultats" />
          {detail.recent.length ? (
            <ul className="space-y-3">
              {detail.recent.slice(0, 6).map((g) => (
                <li key={g.id}>
                  <GameCard game={g} showDate />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucun match joué" icon="🆕">
              <p>
                {detail.upcoming.length
                  ? "Pas encore de match officiel pour cette équipe : ses résultats apparaîtront dès sa première rencontre."
                  : "Aucun résultat disponible pour le moment."}
              </p>
            </EmptyState>
          )}
        </Reveal>

        <Reveal from="right" as="section">
          <SectionHeading id="upcoming" kicker="Heure de Paris" title="Prochains matchs" />
          {detail.upcoming.length ? (
            <ul className="space-y-3">
              {detail.upcoming.slice(0, 6).map((g) => (
                <li key={g.id}>
                  <GameCard game={g} showDate detailed={false} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Aucun match programmé" icon="📅">
              <p>
                {detail.recent.length
                  ? "Saison terminée pour cette équipe. Le calendrier de la prochaine saison sera affiché dès sa publication."
                  : "Le calendrier sera affiché dès sa publication."}
              </p>
            </EmptyState>
          )}
        </Reveal>
      </div>

      <Reveal from="left" as="section" className="mt-16">
        <SectionHeading id="stats" kicker={`Saison ${detail.season}`} title="Statistiques" />
        {detail.stats.length ? (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {detail.stats.map((s) => (
              <div key={s.label} className="glass flex flex-col-reverse rounded-2xl p-4">
                <dt className="text-sm text-muted">{s.label}</dt>
                <dd className="tabular font-display text-3xl font-extrabold">{s.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState title="Statistiques à venir" icon="📊">
            <p>Les statistiques de l’équipe apparaîtront après son premier match de la saison.</p>
          </EmptyState>
        )}
      </Reveal>

      <Reveal from="right" as="section" className="mt-16">
        <SectionHeading id="roster" kicker={`${detail.roster.length} joueurs`} title="Effectif" />
        {detail.roster.length ? (
          <RosterTable roster={detail.roster} teamName={team.name} />
        ) : (
          <EmptyState title="Effectif non disponible" icon="👥" />
        )}
      </Reveal>
    </>
  );
}
