import type { NextRequest } from "next/server";
import { respond } from "@/lib/api/respond";
import { getToday } from "@/lib/data";
import { assertOnlyParams } from "@/lib/validation";
import { REVALIDATE } from "@/lib/env";

export async function GET(req: NextRequest) {
  return respond(async () => {
    assertOnlyParams(req.nextUrl.searchParams, []);
    return getToday();
  }, REVALIDATE.liveCdn, true);
}
