import type { Game, StandingGroup, StandingRow, Standings, Team } from "@/types";

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
  const parEquipe = new Map<string, { game: Game; pour: number; contre: number; adversaire: Team }>();
  for (const g of live) {
    const h = g.home.score ?? 0;
    const a = g.away.score ?? 0;
    parEquipe.set(g.home.team.id, { game: g, pour: h, contre: a, adversaire: g.away.team });
    parEquipe.set(g.away.team.id, { game: g, pour: a, contre: h, adversaire: g.home.team });
  }

  const rangOfficiel = new Map<string, number>();
  const seedOfficiel = new Map<string, number>();
  for (const g of standings.groups)
    for (const r of g.rows) {
      rangOfficiel.set(r.team.id, r.rank);
      seedOfficiel.set(r.team.id, r.seed);
    }

  /**
   * Replace les équipes qui jouent parmi celles qui ne jouent pas.
   *
   * Deux écueils, rencontrés tour à tour :
   *
   * - Tout re-trier à la différence de points réordonnait des équipes qui ne
   *   jouaient même pas : les ligues départagent d'abord aux confrontations
   *   directes, ce que le classement officiel encode déjà. Monaco passait
   *   ainsi devant Panathinaikos sans qu'aucun des deux n'ait joué.
   * - Départager à l'ordre officiel ne vaut pas non plus pour une équipe qui
   *   joue : son rang officiel date d'avant le match. Valencia, qui menait de
   *   dix points pour son premier match, restait derrière des équipes à +1
   *   parce qu'elle était classée parmi les 0-0.
   *
   * D'où une insertion : les équipes au repos gardent entre elles l'ordre
   * officiel, intact ; chaque équipe en train de jouer est glissée devant la
   * première qu'elle devance au pourcentage de victoires, puis à la
   * différence de points.
   */
  const devance = (a: StandingRow, b: StandingRow) => a.winPct > b.winPct || (a.winPct === b.winPct && a.diff > b.diff);

  const inserer = (rows: StandingRow[], rang: Map<string, number>): StandingRow[] => {
    const officiel = (r: StandingRow) => rang.get(r.team.id) ?? Number.MAX_SAFE_INTEGER;
    const auRepos = rows.filter((r) => !r.liveGame).sort((a, b) => officiel(a) - officiel(b));
    const enJeu = rows.filter((r) => r.liveGame).sort((a, b) => b.winPct - a.winPct || b.diff - a.diff);
    const out = [...auRepos];
    for (const r of enJeu) {
      const i = out.findIndex((autre) => devance(r, autre));
      if (i === -1) out.push(r);
      else out.splice(i, 0, r);
    }
    return out;
  };

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
        // Les points du match en cours s'ajoutent aussi : Pts+ et Pts- restent
        // cohérents avec la différence affichée.
        pointsFor: r.pointsFor === undefined ? undefined : r.pointsFor + encours.pour,
        pointsAgainst: r.pointsAgainst === undefined ? undefined : r.pointsAgainst + encours.contre,
        liveGame: {
          score: `${encours.pour}-${encours.contre}`,
          opponent: encours.adversaire.shortName,
          opponentLogo: encours.adversaire.logo,
          detail: encours.game.statusDetail,
          winning: gagne,
        },
      };
    });

    const ordonnees = inserer(rows, rangOfficiel);
    ordonnees.forEach((r, i) => {
      r.rank = i + 1;
      const avant = rangOfficiel.get(r.team.id);
      // Flèche réservée aux équipes qui jouent : une équipe au repos peut
      // reculer d'une place, mais ce n'est pas son match qui l'explique, et la
      // signaler sur dix-sept lignes noierait l'information utile.
      r.movement = r.liveGame && avant !== undefined ? avant - r.rank : 0;
    });
    return { ...groupe, rows: ordonnees };
  });

  // Le « seed » suit la même règle que le classement officiel : rang de
  // conférence partout, sauf en WNBA où les playoffs se jouent sur la ligue
  // entière.
  if (standings.league === "wnba") {
    inserer(
      groups.flatMap((g) => g.rows),
      seedOfficiel,
    ).forEach((r, i) => {
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
