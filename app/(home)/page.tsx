import { getStandings, getTeams, getToday } from "@/lib/data";
import { LEAGUE_IDS } from "@/lib/leagues";
import { HomeLive } from "@/components/home/HomeLive";
import { LiveHero, LiveToday, TodayLabel } from "@/components/home/LiveSections";
import { FavoritePicker } from "@/components/home/FavoritePicker";
import { LeagueCards } from "@/components/home/LeagueCards";
import { TeamGrid } from "@/components/home/TeamGrid";
import { StandingsOverview } from "@/components/home/StandingsOverview";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/ui/Reveal";
import type { LeagueId, Standings, Team, TodayResponse } from "@/types";

const EMPTY_TODAY: TodayResponse = {
  date: new Date().toISOString().slice(0, 10),
  leagues: LEAGUE_IDS.map((league) => ({ league, games: [] })),
  stats: { leagues: 3, teams: 0, gamesToday: 0, pointsToday: 0, seasonPoints: 0, seasonGames: 0, avgPerGame: 0 },
};

export default async function HomePage() {
  const [today, teamsRes, standingsRes] = await Promise.all([
    getToday().catch(() => EMPTY_TODAY),
    Promise.allSettled(LEAGUE_IDS.map(getTeams)),
    Promise.allSettled(LEAGUE_IDS.map(getStandings)),
  ]);

  const teams = Object.fromEntries(
    LEAGUE_IDS.map((l, i) => [l, teamsRes[i].status === "fulfilled" ? teamsRes[i].value : []]),
  ) as Record<LeagueId, Team[]>;
  const standings = standingsRes.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])) as Standings[];
  const counts = Object.fromEntries(LEAGUE_IDS.map((l) => [l, teams[l].length])) as Record<LeagueId, number>;

  return (
    <HomeLive initial={today}>
      <LiveHero />

      <Reveal className="mt-4">
        <FavoritePicker teams={teams} />
      </Reveal>

      <section aria-labelledby="leagues-title" className="mt-20">
        <SectionHeading id="leagues-title" kicker="3 ligues" title="Choisir un championnat" />
        <LeagueCards teamCounts={counts} />
      </section>

      <section aria-labelledby="teams-title" className="mt-20">
        <Reveal from="left">
          <SectionHeading id="teams-title" kicker="Toutes les équipes" title="Les équipes">
            <p className="text-sm text-muted">Cliquez sur un logo pour voir ses 5 derniers matchs.</p>
          </SectionHeading>
        </Reveal>
        <TeamGrid teams={teams} />
      </section>

      <section aria-labelledby="today-title" className="mt-20">
        <Reveal from="right">
          <SectionHeading id="today-title" kicker="En direct · heure de Paris" title="Matchs du jour">
            <p className="text-sm text-muted">
              <TodayLabel />
            </p>
          </SectionHeading>
        </Reveal>
        <LiveToday />
      </section>

      <section aria-labelledby="standings-title" className="mt-20">
        <Reveal from="left">
          <SectionHeading id="standings-title" kicker="Saison régulière" title="Classements">
            <p className="text-sm text-muted">Faites défiler horizontalement →</p>
          </SectionHeading>
        </Reveal>
        <StandingsOverview standings={standings} />
      </section>
    </HomeLive>
  );
}
