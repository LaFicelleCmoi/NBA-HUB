import type { Game, StandingGroup, StandingRow, Standings } from "@/types";

/**
 * Classement recalculé avec les matchs en cours.
 *
 * Les fournisseurs ne comptabilisent une rencontre qu'une fois terminée : le
 * classement officiel ignore donc ce qui se joue en ce moment, et une équipe
 * qui mène de vingt points reste affichée à sa place de la veille.
 *
 * **Seuls les matchs en cours sont ajoutés.** Un match qui vient de s'achever
 * est laissé au classement officiel : impossible de savoir s'il y est déjà
 * intégré, et l'ajouter à tort compterait la victoire deux fois. Le prix à
 * payer est une courte fenêtre, entre le coup de sifflet et la mise à jour
 * officielle, où la rencontre n'est comptée nulle part — un moindre mal face à
 * un bilan faux.
 */
export function withLiveGames(standings: Standings, games: Game[]): Standings {
  const live = games.filter((g) => g.status === "live" && g.league === standings.league);
  if (live.length === 0) return standings;

  // Une équipe ne dispute qu'un match à la fois : une entrée par identifiant.
  const parEquipe = new Map<string, { game: Game; pour: number; contre: number; adversaire: string }>();
  for (const g of live) {
    const h = g.home.score ?? 0;
    const a = g.away.score ?? 0;
    parEquipe.set(g.home.team.id, { game: g, pour: h, contre: a, adversaire: g.away.team.shortName });
    parEquipe.set(g.away.team.id, { game: g, pour: a, contre: h, adversaire: g.home.team.shortName });
  }

  const rangOfficiel = new Map<string, number>();
  const seedOfficiel = new Map<string, number>();
  for (const g of standings.groups)
    for (const r of g.rows) {
      rangOfficiel.set(r.team.id, r.rank);
      seedOfficiel.set(r.team.id, r.seed);
    }

  /**
   * À pourcentage de victoires égal, on conserve l'ordre officiel.
   *
   * Départager soi-même à la différence de points réordonnerait des équipes
   * qui ne jouent même pas : les ligues appliquent leurs propres règles
   * (confrontations directes d'abord), que le classement officiel encode
   * déjà. Seul un match en cours doit pouvoir faire bouger une ligne.
   */
  const ordre = (rang: Map<string, number>) => (a: StandingRow, b: StandingRow) =>
    b.winPct - a.winPct || (rang.get(a.team.id) ?? 0) - (rang.get(b.team.id) ?? 0);

  const groups: StandingGroup[] = standings.groups.map((groupe) => {
    const rows: StandingRow[] = groupe.rows.map((r) => {
      const encours = parEquipe.get(r.team.id);
      if (!encours) return { ...r };

      // À égalité — notamment un match qui vient de commencer, à 0-0 — on ne
      // crédite ni victoire ni défaite : la rencontre n'a encore rien décidé.
      const ecart = encours.pour - encours.contre;
      const gagne = ecart > 0;
      const wins = r.wins + (gagne ? 1 : 0);
      const losses = r.losses + (ecart < 0 ? 1 : 0);
      const played = wins + losses;
      return {
        ...r,
        wins,
        losses,
        played,
        winPct: played ? wins / played : 0,
        diff: r.diff + ecart,
        liveGame: {
          score: `${encours.pour}-${encours.contre}`,
          opponent: encours.adversaire,
          detail: encours.game.statusDetail,
          winning: gagne,
        },
      };
    });

    rows.sort(ordre(rangOfficiel));
    rows.forEach((r, i) => {
      r.rank = i + 1;
      const avant = rangOfficiel.get(r.team.id);
      r.movement = avant === undefined ? 0 : avant - r.rank;
    });
    return { ...groupe, rows };
  });

  // Le « seed » suit la même règle que le classement officiel : rang de
  // conférence partout, sauf en WNBA où les playoffs se jouent sur la ligue
  // entière.
  if (standings.league === "wnba") {
    [...groups.flatMap((g) => g.rows)].sort(ordre(seedOfficiel)).forEach((r, i) => {
      r.seed = i + 1;
    });
  } else {
    for (const g of groups) for (const r of g.rows) r.seed = r.rank;
  }

  return { ...standings, groups };
}

/** Nombre de rencontres en cours prises en compte. */
export const liveCount = (standings: Standings, games: Game[]) =>
  games.filter((g) => g.status === "live" && g.league === standings.league).length;
