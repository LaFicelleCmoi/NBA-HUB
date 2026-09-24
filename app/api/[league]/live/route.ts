import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getLiveGames } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseLeague } from "@/lib/validation";

/** Matchs en cours seuls : charge utile minime, interrogée souvent. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, []);
    return getLiveGames(parseLeague(league));
  }, REVALIDATE.liveCdn, true);
}
