import "server-only";
import { env, REVALIDATE } from "@/lib/env";
import { cachedNormalized, fetchJson, fetchJsonSafe, fetchLive, memoLive } from "@/lib/api/http";
import {
  normalizeEvent,
  normalizeLeaders,
  normalizeNews,
  normalizeRoster,
  normalizeStandings,
  normalizeTeam,
  normalizeTeamStats,
  type RawEspnEvent,
  type RawEspnLeaders,
  type RawEspnNews,
  type RawEspnRoster,
  type RawEspnTeam,
  type RawEspnTeamStats,
  type RawStandingsNode,
} from "@/lib/normalize/espn";
import { normalizeEspnPlays, type RawEspnPlay } from "@/lib/normalize/espn-pbp";
import {
  normalizePlayer,
  type RawAthleteBio,
  type RawAthleteGamelog,
  type RawAthleteOverview,
  type RawAthleteStats,
} from "@/lib/normalize/espn-player";
import {
  normalizeBoxscore,
  normalizeComparison,
  normalizeGameInfo,
  normalizeGameInjuries,
  normalizeGameLeaders,
  normalizeHeadToHead,
  normalizeVideos,
  normalizeWinProbability,
  regulationSeconds,
  type RawSummaryExtras,
} from "@/lib/normalize/espn-summary";
import { buildPlayoffs, type PlayoffGame } from "@/lib/normalize/playoffs";
import { addDays, addMonths, espnDay, espnMonth, parisDayKey } from "@/lib/time";
import type {
  Game,
  GameDetail,
  GamesResponse,
  Playoffs,
  LeadersResponse,
  NewsItem,
  PlayerProfile,
  SearchPlayer,
  Standings,
  Team,
  TeamDetail,
  TodayLeague,
} from "@/types";

export type EspnLeague = "nba" | "wnba";

interface RawScoreboard {
  events?: RawEspnEvent[];
  leagues?: { calendar?: string[]; season?: { year?: number; displayName?: string } }[];
}

interface RawSchedule {
  events?: RawEspnEvent[];
  requestedSeason?: { year?: number; displayName?: string };
}

const site = (l: EspnLeague) => `${env.espnSiteApi}/${l}`;

/* ---------------------------------- Équipes --------------------------------- */

export async function getEspnTeams(league: EspnLeague): Promise<Team[]> {
  const raw = await fetchJson<{
    sports?: { leagues?: { teams?: { team: RawEspnTeam }[] }[] }[];
  }>(`${site(league)}/teams`, REVALIDATE.teams);
  const teams = raw.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams
    .map((t) => t.team)
    .filter((t) => t.isActive !== false)
    .map((t) => normalizeTeam(t, league))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/* -------------------------------- Scoreboard -------------------------------- */

/** `"live"` : sans le Data Cache, pour que le score ne traîne pas d'un cycle. */
async function scoreboard(league: EspnLeague, dates: string | null, mode: number | "no-store" | "live") {
  const qs = dates ? `?dates=${dates}${dates.length === 6 ? "&limit=1000" : ""}` : "";
  const url = `${site(league)}/scoreboard${qs}`;
  return mode === "live" ? fetchLive<RawScoreboard>(url) : fetchJson<RawScoreboard>(url, mode);
}

/**
 * Mois en cours : c'est lui qui contient les matchs en direct. La réponse brute
 * est trop lourde pour le Data Cache, et `unstable_cache` servirait de toute
 * façon une version périmée le temps de se rafraîchir. On mémorise donc le
 * résultat normalisé quelques secondes, sans péremption tolérée.
 */
const monthGamesLive = (league: EspnLeague, month: string) =>
  memoLive(
    `espn-month-live:${league}:${month}`,
    async () => ((await scoreboard(league, month, "live")).events ?? []).map((e) => normalizeEvent(e, league)),
    15_000,
  );
const monthGames = cachedNormalized(
  async (league: EspnLeague, month: string) =>
    ((await scoreboard(league, month, "no-store")).events ?? []).map((e) => normalizeEvent(e, league)),
  "espn-month",
  REVALIDATE.schedule,
);

const byDateAsc = (a: Game, b: Game) => a.date.localeCompare(b.date);
const byDateDesc = (a: Game, b: Game) => b.date.localeCompare(a.date);

/**
 * Matchs du jour au sens de Paris : un match joué le soir aux États-Unis
 * tombe dans la nuit française, on interroge donc les deux jours ESPN
 * couvrant la journée parisienne puis on filtre.
 */
export async function getEspnToday(league: EspnLeague): Promise<TodayLeague> {
  const now = new Date();
  const today = parisDayKey(now);
  const [prev, cur, next] = await Promise.all([
    scoreboard(league, espnDay(addDays(now, -1)), "live"),
    scoreboard(league, espnDay(now), "live"),
    scoreboard(league, null, "live"),
  ]);

  const seen = new Set<string>();
  const games: Game[] = [];
  for (const ev of [...(prev.events ?? []), ...(cur.events ?? [])]) {
    if (seen.has(ev.id) || parisDayKey(ev.date) !== today) continue;
    seen.add(ev.id);
    games.push(normalizeEvent(ev, league));
  }
  games.sort(byDateAsc);

  let nextGame: Game | undefined;
  const upcoming = (next.events ?? [])
    .map((e) => normalizeEvent(e, league))
    .filter((g) => g.status === "scheduled" && parisDayKey(g.date) > today)
    .sort(byDateAsc);
  nextGame = upcoming[0];
  if (!nextGame) {
    const nextDay = next.leagues?.[0]?.calendar?.find((d) => d.slice(0, 10) > today);
    if (nextDay) {
      const sb = await scoreboard(league, nextDay.slice(0, 10).replaceAll("-", ""), REVALIDATE.schedule);
      nextGame = (sb.events ?? []).map((e) => normalizeEvent(e, league)).sort(byDateAsc)[0];
    }
  }
  return { league, games, nextGame };
}

/* ------------------------- Résultats et calendrier -------------------------- */

const MAX_GAMES = 40;

export async function getEspnGames(league: EspnLeague, view: "results" | "upcoming"): Promise<GamesResponse> {
  const now = new Date();
  const games: Game[] = [];
  const step = view === "results" ? -1 : 1;
  const maxMonths = view === "results" ? 8 : 4;

  for (let i = 0; i < maxMonths && games.length < MAX_GAMES; i++) {
    const month = addMonths(now, i * step);
    const list = await (i === 0 ? monthGamesLive : monthGames)(league, espnMonth(month));
    if (view === "results") games.push(...list.filter((g) => g.status === "final").sort(byDateDesc));
    else games.push(...list.filter((g) => g.status !== "final").sort(byDateAsc));
  }

  const out = games.slice(0, MAX_GAMES);
  let note: string | undefined;
  if (view === "results" && out[0] && now.getTime() - new Date(out[0].date).getTime() > 21 * 86_400_000)
    note = "Inter-saison : voici les derniers résultats de la saison précédente.";
  if (view === "upcoming" && out.length === 0) note = "Le calendrier de la prochaine saison n'est pas encore publié.";
  return { league, view, games: out, note };
}

/* -------------------------------- Classements ------------------------------- */

/**
 * Classement de la saison régulière en cours.
 *
 * Sans précision, ESPN renvoie le classement de la phase en cours — en
 * octobre, celui de la présaison, qu'il tient mal (presque tout le monde à
 * 0-0 après plusieurs matchs). Il passait pour la saison commencée et
 * masquait le classement final de la précédente. On lit donc l'année en
 * cours, puis on demande explicitement la saison régulière (`seasontype=2`).
 */
async function regularSeasonStandings(league: EspnLeague): Promise<{ raw: RawStandingsNode; year?: number }> {
  const base = `${env.espnStandingsApi}/${league}/standings`;
  const current = await fetchJson<RawStandingsNode>(base, REVALIDATE.standings);
  const year = current.season?.year;
  if (!year) return { raw: current };
  const regular = await fetchJsonSafe<RawStandingsNode>(`${base}?season=${year}&seasontype=2`, REVALIDATE.standings);
  return { raw: regular ?? current, year };
}

export async function getEspnStandings(league: EspnLeague): Promise<Standings> {
  const base = `${env.espnStandingsApi}/${league}/standings`;
  const { raw: current } = await regularSeasonStandings(league);
  const norm = normalizeStandings(current, league);
  if (norm.totals.games > 0 || !current.season?.year) return { league, isPreviousSeason: false, ...norm };

  // Saison pas encore commencée : on affiche la dernière saison terminée.
  const prevYear = current.season.year - 1;
  const prev = await fetchJsonSafe<RawStandingsNode>(`${base}?season=${prevYear}&seasontype=2`, REVALIDATE.standings);
  if (!prev) return { league, isPreviousSeason: false, ...norm };
  return { league, isPreviousSeason: true, ...normalizeStandings(prev, league) };
}

/** Mois où se joue la présaison, d'après l'année de fin de saison ESPN (2027 pour 2026-27). */
const MOIS_PRESAISON: Record<EspnLeague, (annee: number) => string[]> = {
  nba: (a) => [`${a - 1}09`, `${a - 1}10`],
  wnba: (a) => [`${a}04`, `${a}05`],
};

/**
 * Classement de présaison, recalculé à partir des résultats.
 *
 * ESPN en publie un, mais faux : après plusieurs soirées de matchs, presque
 * toutes les équipes y sont encore à 0-0. On compte donc nous-mêmes les
 * matchs terminés marqués « présaison » (`season.type === 1`). Les équipes
 * et leurs conférences viennent du classement de saison régulière ; un
 * adversaire hors ligue (club européen en tournée) compte pour l'équipe de
 * la ligue qui l'affronte. Rend `null` tant qu'aucun match n'est terminé.
 */
export const getEspnPreseasonStandings = cachedNormalized(
  async (league: EspnLeague): Promise<Standings | null> => {
    const { raw, year } = await regularSeasonStandings(league);
    if (!year) return null;
    const base = normalizeStandings(raw, league);

    const mois = await Promise.all(
      MOIS_PRESAISON[league](year).map((m) => scoreboard(league, m, "no-store").catch(() => ({ events: [] }))),
    );
    const matchs = mois
      .flatMap((sb) => sb.events ?? [])
      .filter((e) => e.season?.type === 1)
      .map((e) => normalizeEvent(e, league))
      .filter((g) => g.status === "final")
      .sort(byDateAsc);
    if (matchs.length === 0) return null;

    type Bilan = { v: number; d: number; pour: number; contre: number; serie: string[] };
    const bilans = new Map<string, Bilan>();
    for (const g of matchs) {
      for (const [nous, eux] of [
        [g.home, g.away],
        [g.away, g.home],
      ] as const) {
        const b = bilans.get(nous.team.id) ?? { v: 0, d: 0, pour: 0, contre: 0, serie: [] };
        const gagne = (nous.score ?? 0) > (eux.score ?? 0);
        b.v += gagne ? 1 : 0;
        b.d += gagne ? 0 : 1;
        b.pour += nous.score ?? 0;
        b.contre += eux.score ?? 0;
        b.serie.push(gagne ? "V" : "D");
        bilans.set(nous.team.id, b);
      }
    }

    /** Série en cours : « V3 », « D1 ». */
    const serie = (resultats: string[]) => {
      const dernier = resultats.at(-1);
      if (!dernier) return undefined;
      let n = 0;
      for (let i = resultats.length - 1; i >= 0 && resultats[i] === dernier; i--) n++;
      return `${dernier}${n}`;
    };

    let points = 0;
    const groups = base.groups.map((g) => {
      const rows = g.rows.map((r) => {
        const b = bilans.get(r.team.id);
        const joues = b ? b.v + b.d : 0;
        points += b?.pour ?? 0;
        return {
          team: r.team,
          rank: 0,
          played: joues,
          wins: b?.v ?? 0,
          losses: b?.d ?? 0,
          winPct: joues ? b!.v / joues : 0,
          diff: b ? b.pour - b.contre : 0,
          pointsFor: b?.pour ?? 0,
          pointsAgainst: b?.contre ?? 0,
          streak: b ? serie(b.serie) : undefined,
          seed: 0,
        };
      });
      // Pourcentage d'abord, puis le nombre de victoires (3-0 devant 1-0),
      // puis la différence ; les équipes qui n'ont pas joué ferment la marche.
      rows.sort(
        (a, b) =>
          Number(b.played > 0) - Number(a.played > 0) || b.winPct - a.winPct || b.wins - a.wins || b.diff - a.diff,
      );
      rows.forEach((r, i) => {
        r.rank = i + 1;
        r.seed = i + 1;
      });
      return { name: g.name, rows };
    });

    return {
      league,
      season: base.season,
      isPreviousSeason: false,
      preseason: true,
      groups,
      totals: { games: matchs.length, points },
    };
  },
  "espn-preseason-standings",
  REVALIDATE.standings,
);

/* ---------------------------------- Leaders --------------------------------- */

export const getEspnLeaders = cachedNormalized(
  async (league: EspnLeague): Promise<LeadersResponse> => {
    const raw = await fetchJson<RawEspnLeaders>(`${env.espnWebApi}/${league}/leaders?limit=10`, "no-store");
    return { league, season: raw.requestedSeason?.displayName ?? "", leaders: normalizeLeaders(raw, league) };
  },
  "espn-leaders",
  REVALIDATE.leaders,
);

/* ----------------------------------- News ----------------------------------- */

export async function getEspnNews(league: EspnLeague): Promise<NewsItem[]> {
  const raw = await fetchJson<RawEspnNews>(`${site(league)}/news?limit=18`, REVALIDATE.news);
  return normalizeNews(raw);
}

/* ---------------------------------- Équipe ---------------------------------- */

async function teamSchedule(league: EspnLeague, id: string) {
  const base = `${site(league)}/teams/${id}/schedule`;
  const def = await fetchJson<RawSchedule>(base, REVALIDATE.schedule);
  const year = def.requestedSeason?.year;
  const pull = (y: number) =>
    Promise.all([
      fetchJsonSafe<RawSchedule>(`${base}?season=${y}&seasontype=2`, REVALIDATE.schedule),
      fetchJsonSafe<RawSchedule>(`${base}?season=${y}&seasontype=3`, REVALIDATE.schedule),
    ]);

  const collect = (lists: (RawSchedule | null)[]) => {
    const map = new Map<string, Game>();
    for (const l of lists) for (const e of l?.events ?? []) map.set(e.id, normalizeEvent(e, league));
    return [...map.values()];
  };

  let all = collect([def, ...(year ? await pull(year) : [])]);
  let season = def.requestedSeason?.displayName ?? "";
  const upcoming = all.filter((g) => g.status === "scheduled" || g.status === "live").sort(byDateAsc);
  let recent = all.filter((g) => g.status === "final").sort(byDateDesc);

  if (recent.length === 0 && year) {
    const prev = await pull(year - 1);
    all = collect(prev);
    recent = all.filter((g) => g.status === "final").sort(byDateDesc);
    season = prev.find((p) => p?.requestedSeason?.displayName)?.requestedSeason?.displayName ?? season;
  }
  return { recent, upcoming, season };
}

export async function getEspnRecent(league: EspnLeague, id: string): Promise<Game[]> {
  const { recent } = await teamSchedule(league, id);
  return recent.slice(0, 5);
}

/**
 * Forme et prochaine affiche seules : inutile de charger effectif et statistiques.
 *
 * Le calendrier de l'équipe est en cache dix minutes : un match qui vient de
 * se terminer y restait « à venir », et la carte « Mon équipe » l'annonçait
 * encore comme prochain match. On le recoupe avec les matchs du jour, frais à
 * quelques secondes près : un match du jour terminé rejoint la forme, et le
 * prochain match est le premier qui n'est pas encore joué.
 */
export async function getEspnTeamForm(league: EspnLeague, id: string) {
  const [{ recent, upcoming }, today] = await Promise.all([
    teamSchedule(league, id),
    getEspnToday(league).catch(() => null),
  ]);
  const duJour = new Map(
    (today?.games ?? []).filter((g) => g.home.team.id === id || g.away.team.id === id).map((g) => [g.id, g]),
  );
  const frais = (g: Game) => duJour.get(g.id) ?? g;

  const termines = [...duJour.values()].filter((g) => g.status === "final");
  const vus = new Set(termines.map((g) => g.id));
  const joues = [...termines, ...recent.filter((g) => !vus.has(g.id))].sort(byDateDesc);
  // Une forme ne traverse pas l'intersaison : le premier match de présaison
  // ne se mêle pas aux derniers matchs de la saison passée, trois mois plus tôt.
  const dernier = joues[0] ? Date.parse(joues[0].date) : 0;
  const forme = joues.filter((g) => dernier - Date.parse(g.date) < 90 * 24 * 3600 * 1000);
  const aVenir = upcoming.map(frais).filter((g) => g.status === "scheduled" || g.status === "live");

  return { recent: forme.slice(0, 5), next: aVenir[0] };
}

/** Salle du club : « State Farm Arena — Atlanta, GA ». Absente en WNBA. */
function venueOf(team: RawEspnTeam): string | undefined {
  const v = team.franchise?.venue;
  if (!v?.fullName) return undefined;
  const place = [v.address?.city, v.address?.state].filter(Boolean).join(", ");
  return place ? `${v.fullName} — ${place}` : v.fullName;
}

export async function getEspnTeamDetail(league: EspnLeague, id: string): Promise<TeamDetail> {
  const [info, roster, schedule, stats] = await Promise.all([
    fetchJson<{ team: RawEspnTeam }>(`${site(league)}/teams/${id}`, REVALIDATE.teams),
    fetchJsonSafe<RawEspnRoster>(`${site(league)}/teams/${id}/roster`, REVALIDATE.roster),
    teamSchedule(league, id),
    fetchJsonSafe<RawEspnTeamStats>(`${site(league)}/teams/${id}/statistics`, REVALIDATE.roster),
  ]);
  const r = roster ? normalizeRoster(roster) : { roster: [], coach: undefined };
  return {
    team: normalizeTeam(info.team, league),
    season: schedule.season,
    standingSummary: info.team.standingSummary,
    coach: r.coach,
    venue: venueOf(info.team),
    records: [],
    roster: r.roster,
    recent: schedule.recent.slice(0, 10),
    upcoming: schedule.upcoming.slice(0, 10),
    stats: stats ? normalizeTeamStats(stats) : [],
  };
}

/* ------------------------------- Match -------------------------------- */

interface RawSummary extends RawSummaryExtras {
  header?: { id?: string; competitions?: (NonNullable<RawEspnEvent["competitions"]>[number] & { date?: string })[] };
  plays?: RawEspnPlay[];
}

/**
 * Un match au complet : en-tête, play-by-play, et tout ce qu'ESPN publie
 * autour — feuille de match, comparatif, meilleurs joueurs, probabilité de
 * victoire, infos, blessés, confrontations, vidéos. Un seul appel les porte
 * tous : les afficher ne coûte aucune requête de plus.
 *
 * Toujours sans cache de données : le même appel sert un match en cours, où
 * chaque seconde compte, et un match terminé. `fetchLive` mémorise quelques
 * secondes, ce qui borne la charge quel que soit le nombre de visiteurs.
 */
export async function getEspnGameDetail(league: EspnLeague, id: string): Promise<GameDetail> {
  const raw = await fetchLive<RawSummary>(`${site(league)}/summary?event=${id}`);
  const comp = raw.header?.competitions?.[0];
  if (!comp) throw new Error("match introuvable");

  // L'en-tête du résumé ne porte pas de numéro de période : on le déduit du
  // nombre de quarts-temps joués, sans quoi une prolongation passerait inaperçue.
  const joues = Math.max(0, ...comp.competitors.map((c) => c.linescores?.length ?? 0));
  const status = { ...comp.status, period: comp.status?.period ?? joues };
  const game = normalizeEvent(
    {
      id: String(raw.header?.id ?? id),
      date: comp.date ?? "",
      competitions: [{ ...comp, status, venue: comp.venue ?? raw.gameInfo?.venue }],
    },
    league,
  );
  const plays = raw.plays ?? [];
  const final = game.status === "final" ? { homeWon: game.home.winner } : undefined;
  return {
    game,
    plays: normalizeEspnPlays(plays),
    boxscore: normalizeBoxscore(raw.boxscore),
    comparison: normalizeComparison(raw.boxscore),
    leaders: normalizeGameLeaders(raw.leaders),
    winProbability: normalizeWinProbability(raw.winprobability, plays, raw.format, final),
    regulationSeconds: regulationSeconds(raw.format),
    info: normalizeGameInfo(raw.gameInfo, raw.broadcasts),
    injuries: normalizeGameInjuries(raw.injuries),
    headToHead: normalizeHeadToHead(raw.seasonseries),
    videos: normalizeVideos(raw.videos),
  };
}

/* ----------------------------- Phase finale ----------------------------- */

const conference = (c: string) => (c.toLowerCase() === "east" ? "Est" : "Ouest");

/**
 * Tour d'un match de phase finale, d'après la mention qu'ESPN lui attache
 * (« East 1st Round - Game 6 », « WNBA Finals - Game 5 If Necessary »…).
 * Une mention non reconnue écarte le match plutôt que de l'inventer.
 */
function tourEspn(headline: string): Omit<PlayoffGame, "game" | "bestOf"> | null {
  const h = headline.replace(/ - Game \d+(?: If Necessary)?$/i, "").trim();
  let m: RegExpMatchArray | null;
  if ((m = h.match(/Play-In - (East|West) - (.+)$/i))) {
    const affiche = m[2]
      .replace(/(\d+)(?:st|nd|rd|th) Place vs (\d+)(?:st|nd|rd|th) Place/i, "$1e contre $2e")
      .replace(/(\d+)(?:st|nd|rd|th) Seed Game/i, "match pour la $1e place");
    return { round: "Play-in", order: 0, label: `${conference(m[1])} · ${affiche}` };
  }
  if ((m = h.match(/^(East|West) 1st Round$/i))) return { round: "1er tour", order: 1, label: conference(m[1]) };
  if ((m = h.match(/^(East|West) Semifinals$/i)))
    return { round: "Demi-finales de conférence", order: 2, label: conference(m[1]) };
  if ((m = h.match(/^(East|West) Finals$/i))) return { round: "Finales de conférence", order: 3, label: conference(m[1]) };
  if (/^NBA Finals$/i.test(h)) return { round: "Finale NBA", order: 4 };
  if (/^First Round$/i.test(h)) return { round: "1er tour", order: 1 };
  if (/^Semifinals$/i.test(h)) return { round: "Demi-finales", order: 2 };
  if (/^WNBA Finals$/i.test(h)) return { round: "Finale WNBA", order: 4 };
  return null;
}

/** Mois où se joue la phase finale, et mois de début. */
const PHASE_FINALE: Record<EspnLeague, { mois: number[] }> = {
  nba: { mois: [4, 5, 6] },
  wnba: { mois: [9, 10] },
};

async function playoffGames(league: EspnLeague, annee: number): Promise<PlayoffGame[]> {
  const listes = await Promise.all(
    PHASE_FINALE[league].mois.map((m) => scoreboard(league, `${annee}${String(m).padStart(2, "0")}`, "no-store")),
  );
  const out: (PlayoffGame & { numero: number })[] = [];
  const vus = new Set<string>();
  for (const ev of listes.flatMap((l) => l.events ?? [])) {
    // 3 : phase finale ; 5 : play-in. Le reste est de la saison régulière.
    if (vus.has(ev.id) || (ev.season?.type !== 3 && ev.season?.type !== 5)) continue;
    const headline = ev.competitions?.[0]?.notes?.[0]?.headline ?? "";
    const tour = tourEspn(headline);
    if (!tour) continue;
    vus.add(ev.id);
    out.push({
      ...tour,
      game: normalizeEvent(ev, league),
      bestOf: ev.competitions?.[0]?.series?.totalCompetitions,
      numero: Number(headline.match(/Game (\d+)/i)?.[1] ?? 0),
    });
  }

  // Affiches inconnues : ESPN donne à toutes les séries d'un même tour les
  // mêmes équipes provisoires (-1 et -2, « TBD »), sans rien qui les
  // distingue. Chaque « Game N » y apparaît en revanche une fois par série :
  // on répartit donc les matchs d'un même numéro entre les séries, dans un
  // ordre stable.
  const inconnue = (g: PlayoffGame) => [g.game.home.team.id, g.game.away.team.id].every((id) => id.startsWith("-"));
  const parNumero = new Map<string, typeof out>();
  for (const g of out.filter(inconnue)) {
    const k = `${g.order}|${g.label ?? ""}|${g.numero}`;
    parNumero.set(k, [...(parNumero.get(k) ?? []), g]);
  }
  for (const groupe of parNumero.values()) {
    groupe
      .sort((a, b) => a.game.date.localeCompare(b.game.date) || a.game.id.localeCompare(b.game.id))
      .forEach((g, i) => {
        g.slot = i;
      });
  }
  return out;
}

/**
 * Phase finale la plus récente : celle de l'année en cours dès qu'elle a
 * commencé, la précédente sinon.
 *
 * Le calcul lit plusieurs mois de matchs, trop lourds pour le cache de données :
 * on mémorise le tableau calculé. Cinq minutes suffisent — une série ne bouge
 * qu'à la fin d'un match, et le score en direct, lui, vit ailleurs.
 */
export const getEspnPlayoffs = cachedNormalized(
  async (league: EspnLeague): Promise<Playoffs> => {
    const now = new Date();
    const annee = now.getUTCFullYear();
    const debut = PHASE_FINALE[league].mois[0];
    const candidates = now.getUTCMonth() + 1 >= debut ? [annee, annee - 1] : [annee - 1, annee - 2];
    const libelle = (a: number) => (league === "nba" ? `${a - 1}-${String(a % 100).padStart(2, "0")}` : String(a));

    for (const a of candidates) {
      const games = await playoffGames(league, a);
      if (games.length > 0) {
        return buildPlayoffs(league, libelle(a), games, (round) =>
          round === "Play-in" ? 1 : league === "nba" ? 7 : round === "1er tour" ? 3 : round === "Demi-finales" ? 5 : 7,
        );
      }
    }
    return buildPlayoffs(league, libelle(candidates[0]), [], () => 1);
  },
  "espn-playoffs",
  REVALIDATE.schedule / 2,
);

/* -------------------------------- Joueur -------------------------------- */

/**
 * Les fiches joueur sont servies par l'API « common » d'ESPN, voisine de celle
 * des leaders (« site ») : même hôte, autre préfixe. On la déduit de la base
 * configurée pour qu'une surcharge d'ESPN_WEB_API s'applique aux deux.
 */
const athletes = (l: EspnLeague) => `${env.espnWebApi.replace("/apis/site/", "/apis/common/")}/${l}/athletes`;

/**
 * Fiche complète d'un joueur : cinq appels en parallèle (identité, carrière en
 * saison régulière, carrière en playoffs, vue d'ensemble, matchs de la
 * saison). Seule l'identité est indispensable ; sans les autres, la fiche
 * s'affiche avec ce qu'elle a. Une heure de cache : ces chiffres ne bougent
 * qu'une fois par match.
 */
export async function getEspnPlayer(league: EspnLeague, id: string): Promise<PlayerProfile> {
  const base = `${athletes(league)}/${id}`;
  const [bio, regular, playoffs, overview, gamelog] = await Promise.all([
    fetchJson<RawAthleteBio>(base, REVALIDATE.roster),
    fetchJsonSafe<RawAthleteStats>(`${base}/stats`, REVALIDATE.roster),
    fetchJsonSafe<RawAthleteStats>(`${base}/stats?seasontype=3`, REVALIDATE.roster),
    fetchJsonSafe<RawAthleteOverview>(`${base}/overview`, REVALIDATE.roster),
    fetchJsonSafe<RawAthleteGamelog>(`${base}/gamelog`, REVALIDATE.roster),
  ]);
  if (!bio.athlete?.id) throw new Error("joueur introuvable");
  return normalizePlayer(league, id, bio, regular, playoffs, overview, gamelog);
}

/* ------------------------------- Recherche ------------------------------- */

interface RawSearchV2 {
  results?: {
    type?: string;
    contents?: { uid?: string; displayName?: string; subtitle?: string; image?: { default?: string } }[];
  }[];
}

interface RawSearchCommon {
  items?: {
    id?: string;
    displayName?: string;
    league?: string;
    headshot?: { href?: string };
    position?: { abbreviation?: string };
    teamRelationships?: { displayName?: string }[];
  }[];
}

/** Ligues ESPN d'après l'identifiant interne porté par l'uid (« s:40~l:46~a:1966 »). */
const LIGUE_UID: Record<string, EspnLeague> = { "46": "nba", "59": "wnba" };

/**
 * Joueurs NBA et WNBA dont le nom correspond. Deux recherches ESPN, chacune
 * avec son angle mort, d'où leur combinaison :
 *
 * - la recherche générale connaît les retraités (Kobe Bryant, Diana Taurasi)
 *   et les surnoms (« wemby »), mais mêle tous les sports : sur un nom
 *   courant, les basketteurs y sont noyés ;
 * - la recherche par ligue ne connaît que les joueurs en activité, mais
 *   seulement ceux de la ligue demandée.
 *
 * La première passe en tête (pertinence), la seconde complète. Une heure de
 * cache par requête.
 */
export async function searchEspnPlayers(query: string): Promise<SearchPlayer[]> {
  const origine = new URL(env.espnWebApi).origin;
  const q = encodeURIComponent(query);
  const [general, nba, wnba] = await Promise.all([
    fetchJsonSafe<RawSearchV2>(`${origine}/apis/search/v2?query=${q}&limit=50&type=player`, REVALIDATE.roster),
    ...(["nba", "wnba"] as const).map((l) =>
      fetchJsonSafe<RawSearchCommon>(
        `${origine}/apis/common/v3/search?query=${q}&limit=10&type=player&league=${l}`,
        REVALIDATE.roster,
      ),
    ),
  ]);

  const out = new Map<string, SearchPlayer>();
  const ajouter = (p: SearchPlayer) => {
    if (p.id && !out.has(`${p.league}:${p.id}`)) out.set(`${p.league}:${p.id}`, p);
  };

  for (const c of general?.results?.find((r) => r.type === "player")?.contents ?? []) {
    const m = c.uid?.match(/~l:(\d+)~a:(\d+)/);
    const league = m ? LIGUE_UID[m[1]] : undefined;
    if (!m || !league) continue;
    ajouter({
      id: m[2],
      league,
      name: c.displayName ?? "",
      team: c.subtitle || undefined,
      headshot: c.image?.default || undefined,
      href: `/${league}/joueur/${m[2]}`,
    });
  }
  for (const [league, res] of [["nba", nba], ["wnba", wnba]] as const) {
    for (const i of res?.items ?? []) {
      ajouter({
        id: String(i.id ?? ""),
        league,
        name: i.displayName ?? "",
        team: i.teamRelationships?.[0]?.displayName,
        position: i.position?.abbreviation,
        headshot: i.headshot?.href,
        href: `/${league}/joueur/${i.id}`,
      });
    }
  }
  return [...out.values()];
}
