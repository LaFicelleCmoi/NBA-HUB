import "server-only";
import { isLeagueId } from "@/lib/leagues";
import { getTeams } from "@/lib/data";
import type { LeagueId } from "@/types";

export class ValidationError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Format attendu des identifiants d'équipe, par fournisseur. */
const TEAM_ID_FORMAT: Record<LeagueId, RegExp> = {
  nba: /^\d{1,7}$/,
  wnba: /^\d{1,7}$/,
  euroleague: /^[A-Z]{2,4}$/,
};

export function parseLeague(value: unknown): LeagueId {
  if (!isLeagueId(value)) throw new ValidationError(404, "Ligue inconnue");
  return value;
}

/**
 * Double contrôle : format strict puis appartenance à la liste blanche
 * (liste des équipes de la ligue, mise en cache). Aucun identifiant
 * arbitraire n'est donc jamais transmis à l'API amont.
 */
export async function parseTeamId(league: LeagueId, value: unknown): Promise<string> {
  if (typeof value !== "string" || !TEAM_ID_FORMAT[league].test(value)) {
    throw new ValidationError(400, "Identifiant d'équipe invalide");
  }
  const teams = await getTeams(league);
  if (!teams.some((t) => t.id === value)) throw new ValidationError(404, "Équipe inconnue");
  return value;
}

export function parseView(value: string | null): "results" | "upcoming" {
  if (value === "results" || value === "upcoming") return value;
  throw new ValidationError(400, "Paramètre « view » invalide");
}

/** Rejette tout paramètre de requête non prévu. */
export function assertOnlyParams(params: URLSearchParams, allowed: string[]) {
  for (const key of params.keys()) {
    if (!allowed.includes(key)) throw new ValidationError(400, "Paramètre non autorisé");
  }
}
