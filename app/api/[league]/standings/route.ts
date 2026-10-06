import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getPreseasonStandings, getStandings } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseLeague, ValidationError } from "@/lib/validation";

/** Classement officiel, ou de présaison avec `?phase=preseason` (`null` s'il n'y en a pas). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  return respond(async () => {
    const qs = req.nextUrl.searchParams;
    assertOnlyParams(qs, ["phase"]);
    const phase = qs.get("phase");
    if (phase !== null && phase !== "preseason") throw new ValidationError(400, "Paramètre « phase » invalide");
    const l = parseLeague(league);
    return phase === "preseason" ? getPreseasonStandings(l) : getStandings(l);
  }, REVALIDATE.standings);
}
