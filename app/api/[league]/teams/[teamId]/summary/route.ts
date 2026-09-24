import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getTeamSummary } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseLeague, parseTeamId } from "@/lib/validation";

type Params = { params: Promise<{ league: string; teamId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { league, teamId } = await params;
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, []);
    const l = parseLeague(league);
    return getTeamSummary(l, await parseTeamId(l, teamId));
  }, REVALIDATE.schedule);
}
