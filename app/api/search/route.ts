import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { search } from "@/lib/data";
import { REVALIDATE } from "@/lib/env";
import { assertOnlyParams, parseSearchQuery } from "@/lib/validation";

/** Recherche de clubs et de joueurs, toutes ligues : `/api/search?q=brunson`. */
export async function GET(req: NextRequest) {
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, ["q"]);
    return search(parseSearchQuery(req.nextUrl.searchParams.get("q")));
  }, REVALIDATE.roster);
}
