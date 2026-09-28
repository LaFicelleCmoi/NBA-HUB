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
import { buildPlayoffs, type PlayoffGame } from "@/lib/normalize/playoffs";
import { addDays, addMonths, espnDay, espnMonth, parisDayKey } from "@/lib/time";
import type {
  Game,
  GameDetail,
  GamesResponse,
  Playoffs,
  LeadersResponse,
  NewsItem,
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

export async function getEspnStandings(league: EspnLeague): Promise<Standings> {
  const base = `${env.espnStandingsApi}/${league}/standings`;
  const current = await fetchJson<RawStandingsNode>(base, REVALIDATE.standings);
  const norm = normalizeStandings(current, league);
  if (norm.totals.games > 0 || !current.season?.year) return { league, isPreviousSeason: false, ...norm };

  // Saison pas encore commencée : on affiche la dernière saison terminée.
  const prevYear = current.season.year - 1;
  const prev = await fetchJsonSafe<RawStandingsNode>(`${base}?season=${prevYear}&seasontype=2`, REVALIDATE.standings);
  if (!prev) return { league, isPreviousSeason: false, ...norm };
  return { league, isPreviousSeason: true, ...normalizeStandings(prev, league) };
}

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

/** Forme et prochaine affiche seules : inutile de charger effectif et statistiques. */
export async function getEspnTeamForm(league: EspnLeague, id: string) {
  const { recent, upcoming } = await teamSchedule(league, id);
  return { recent: recent.slice(0, 5), next: upcoming[0] };
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

interface RawSummary {
  header?: { id?: string; competitions?: (NonNullable<RawEspnEvent["competitions"]>[number] & { date?: string })[] };
  gameInfo?: { venue?: { fullName?: string } };
  plays?: RawEspnPlay[];
}

/**
 * En-tête et play-by-play d'un match.
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
  return { game, plays: normalizeEspnPlays(raw.plays ?? []) };
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
