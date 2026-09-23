import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getStandings } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseLeague } from "@/lib/validation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ league: string }> }) {
  const { league } = await params;
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, []);
    return getStandings(parseLeague(league));
  }, REVALIDATE.standings);
}
