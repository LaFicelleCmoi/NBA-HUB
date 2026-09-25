import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGameDetail } from "@/lib/data";
import { isLeagueId, LEAGUES } from "@/lib/leagues";
import { parseGameId, ValidationError } from "@/lib/validation";
import { MatchView } from "@/components/match/MatchView";
import { ErrorState } from "@/components/ui/EmptyState";
import type { GameDetail, LeagueId } from "@/types";

type Props = { params: Promise<{ league: string; gameId: string }> };

/** Validation avant tout appel amont : un identifiant mal formé est un vrai 404. */
function valider(league: string, gameId: string): { l: LeagueId; id: string } {
  if (!isLeagueId(league)) notFound();
  try {
    return { l: league, id: parseGameId(league, gameId) };
  } catch (err) {
    if (err instanceof ValidationError) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league, gameId } = await params;
  if (!isLeagueId(league)) return {};
  const detail = await getGameDetail(league, gameId).catch(() => null);
  if (!detail) return { title: "Match" };
  const { home, away } = detail.game;
  return {
    title: `${away.team.name} – ${home.team.name}`,
    description: `Score et play-by-play de ${away.team.name} – ${home.team.name} (${LEAGUES[league].name}).`,
  };
}

export default async function MatchPage({ params }: Props) {
  const { league, gameId } = await params;
  const { l, id } = valider(league, gameId);
  const detail: GameDetail | null = await getGameDetail(l, id).catch(() => null);

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
              {LEAGUES[l].name}
            </Link>{" "}
            /
          </li>
          <li aria-current="page" className="text-muted">
            {detail ? `${detail.game.away.team.shortName} – ${detail.game.home.team.shortName}` : "Match"}
          </li>
        </ol>
      </nav>
      {detail ? <MatchView league={l} id={id} initial={detail} /> : <ErrorState message="Impossible de charger ce match" />}
    </>
  );
}
