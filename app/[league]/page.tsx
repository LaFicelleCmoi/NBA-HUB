import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getStandings } from "@/lib/data";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { LeagueTabs } from "@/components/league/LeagueTabs";
import { Logo } from "@/components/ui/Logo";
import { Skeleton, SkeletonList } from "@/components/ui/Skeleton";
import type { LeagueId } from "@/types";

type Props = { params: Promise<{ league: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  if (!isLeagueId(league)) return {};
  const l = LEAGUES[league];
  return {
    title: l.name,
    description: `Classement, résultats, calendrier, leaders et actualités ${l.name}.`,
  };
}

/** Partie dépendante des données, diffusée en streaming derrière un skeleton. */
async function LeagueContent({ league }: { league: LeagueId }) {
  const standings = await getStandings(league).catch(() => null);
  return <LeagueTabs league={league} initialStandings={standings} />;
}

async function SeasonLabel({ league }: { league: LeagueId }) {
  const standings = await getStandings(league).catch(() => null);
  return standings ? <p className="mt-1 text-sm text-muted">Saison {standings.season}</p> : null;
}

export default async function LeaguePage({ params }: Props) {
  const { league } = await params;
  // Validation AVANT toute frontière Suspense : le 404 garde son vrai code HTTP.
  if (!isLeagueId(league)) notFound();
  const l = LEAGUES[league];

  return (
    <>
      <section
        aria-labelledby="league-title"
        className="relative mb-6 overflow-hidden rounded-3xl p-6 sm:p-10"
        style={{
          background: `linear-gradient(120deg, color-mix(in srgb, var(--${league}) 28%, transparent), color-mix(in srgb, var(--${league}-2) 18%, transparent))`,
        }}
      >
        <div className="flex items-center gap-4 sm:gap-6">
          <Logo logo={l.logo} alt={`Logo ${l.name}`} size={88} className="h-16 w-16 sm:h-24 sm:w-24" priority />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">{l.region}</p>
            <h1 id="league-title" className="font-display text-5xl font-extrabold uppercase leading-none sm:text-7xl">
              {l.name}
            </h1>
            <Suspense fallback={<Skeleton className="mt-2 h-4 w-28" />}>
              <SeasonLabel league={league} />
            </Suspense>
          </div>
        </div>
      </section>
      <Suspense
        fallback={
          <div className="space-y-6">
            <Skeleton className="h-12 w-full" />
            <SkeletonList rows={8} className="h-10" />
          </div>
        }
      >
        <LeagueContent league={league} />
      </Suspense>
    </>
  );
}
