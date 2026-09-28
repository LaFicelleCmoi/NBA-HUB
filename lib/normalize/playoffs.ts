import type { Game, PlayoffRound, PlayoffSeries, Playoffs, Team } from "@/types";

/**
 * Construction d'un tableau de phase finale à partir d'une liste de matchs.
 *
 * Commun aux fournisseurs : chacun décrit ses matchs à sa façon, mais une fois
 * rattaché à un tour, un tableau et une affiche, le calcul est le même. Les
 * victoires sont comptées sur les matchs terminés plutôt que lues dans un
 * champ récapitulatif : c'est la seule source qui ne peut pas être en retard
 * sur les résultats affichés juste à côté.
 */

/** Un match de phase finale, rattaché à son tour et à son affiche. */
export interface PlayoffGame {
  game: Game;
  /** Nom français du tour. */
  round: string;
  /** Rang du tour dans le déroulé : 0 pour le play-in, puis croissant jusqu'à la finale. */
  order: number;
  /** Tableau ou affiche, quand le tour en a plusieurs (« Est », « Ouest »…). */
  label?: string;
  /** Format de la série, quand le fournisseur le donne. */
  bestOf?: number;
  /**
   * Rang de la série parmi celles dont les affiches ne sont pas encore
   * connues. Sans lui, deux demi-finales « TBD contre TBD » se confondraient
   * en une seule série de dix matchs.
   */
  slot?: number;
}

/** Une équipe dont l'affiche n'est pas encore connue (« TBD ») n'est pas une équipe. */
const connue = (t: Team) => Boolean(t.id) && !t.id.startsWith("-") && t.id !== "0";

function seriesOf(key: string, items: PlayoffGame[], defaultBestOf: number): PlayoffSeries {
  const first = items[0];
  // Tête de série en premier : elle reçoit le premier match.
  const ordered = [...items].sort((a, b) => a.game.date.localeCompare(b.game.date));
  const g0 = ordered[0].game;
  const teams: [Team | null, Team | null] = [
    connue(g0.home.team) ? g0.home.team : null,
    connue(g0.away.team) ? g0.away.team : null,
  ];
  const wins: [number, number] = [0, 0];
  for (const { game } of ordered) {
    if (game.status !== "final") continue;
    const vainqueur = game.home.winner ? game.home.team.id : game.away.winner ? game.away.team.id : undefined;
    if (vainqueur && vainqueur === teams[0]?.id) wins[0]++;
    else if (vainqueur && vainqueur === teams[1]?.id) wins[1]++;
  }
  const bestOf = Math.max(defaultBestOf, ...items.map((i) => i.bestOf ?? 0));
  const seuil = Math.floor(bestOf / 2) + 1;
  const winner = wins[0] >= seuil ? teams[0]?.id : wins[1] >= seuil ? teams[1]?.id : undefined;
  const live = ordered.some((i) => i.game.status === "live");

  // Une fois la série décidée, les matchs « si nécessaire » ne seront jamais
  // joués : on ne garde que ceux qui ont eu lieu.
  const games = ordered
    .map((i) => i.game)
    .filter((g) => !winner || g.status === "final" || g.status === "live");

  return {
    id: key,
    label: first.label,
    teams,
    wins,
    bestOf,
    winner,
    status: live ? "live" : winner ? "final" : wins[0] + wins[1] > 0 ? "ongoing" : "scheduled",
    games,
  };
}

export function buildPlayoffs(
  league: Playoffs["league"],
  season: string,
  items: PlayoffGame[],
  defaultBestOf: (round: string) => number,
): Playoffs {
  const parSerie = new Map<string, PlayoffGame[]>();
  for (const it of items) {
    const ids = [it.game.home.team, it.game.away.team]
      .map((t) => (connue(t) ? t.id : "?"))
      .sort()
      .join("-");
    const key = `${it.order}|${it.label ?? ""}|${ids}|${it.slot ?? ""}`;
    parSerie.set(key, [...(parSerie.get(key) ?? []), it]);
  }

  const parTour = new Map<number, { name: string; series: PlayoffSeries[] }>();
  for (const [key, games] of parSerie) {
    const { order, round } = games[0];
    const tour = parTour.get(order) ?? { name: round, series: [] };
    tour.series.push(seriesOf(key, games, defaultBestOf(round)));
    parTour.set(order, tour);
  }

  // Chaque tour : les tableaux dans un ordre stable (Ouest avant Est, comme
  // les classements), puis par date du premier match.
  const rangTableau = (l?: string) => (l?.startsWith("Ouest") ? 0 : l?.startsWith("Est") ? 1 : 2);
  const rounds: PlayoffRound[] = [...parTour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => ({
      name: t.name,
      series: t.series.sort(
        (a, b) =>
          rangTableau(a.label) - rangTableau(b.label) || (a.games[0]?.date ?? "").localeCompare(b.games[0]?.date ?? ""),
      ),
    }));

  const finale = rounds.at(-1);
  const decisive = finale?.series.length === 1 ? finale.series[0] : undefined;
  const champion = decisive?.winner ? decisive.teams.find((t) => t?.id === decisive.winner) ?? undefined : undefined;

  return {
    league,
    season,
    rounds,
    champion,
    note: items.length === 0 ? "Aucun match de phase finale pour le moment." : undefined,
  };
}
