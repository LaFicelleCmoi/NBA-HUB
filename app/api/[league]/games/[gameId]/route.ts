import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getGameDetail } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseGameId, parseLeague } from "@/lib/validation";

type Params = { params: Promise<{ league: string; gameId: string }> };

/** En-tête et play-by-play d'un match, interrogés à la cadence du direct. */
export async function GET(req: NextRequest, { params }: Params) {
  const { league, gameId } = await params;
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, []);
    const l = parseLeague(league);
    return getGameDetail(l, parseGameId(l, gameId));
  }, REVALIDATE.liveCdn, true);
}
