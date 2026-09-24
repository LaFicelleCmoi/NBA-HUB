import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getGames } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseLeague, parseView } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  return respond(async () => {
    const sp = req.nextUrl.searchParams;
    assertOnlyParams(sp, ["view"]);
    return getGames(parseLeague(league), parseView(sp.get("view")));
  }, REVALIDATE.liveCdn, true);
}
