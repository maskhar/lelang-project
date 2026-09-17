import { NextRequest, NextResponse } from "next/server";
import { readAuthJson } from "@/server/auth/http";
import { requireCsrf } from "@/server/auth/csrf";
import { apiErrorResponse } from "@/server/api";
import { createLead } from "@/server/properties/service";
import { leadInput } from "@/server/properties/validation";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { getAuthenticatedActor } from "@/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    await consumeRateLimit("lead:global", 100, 60);
    const input = leadInput.parse(await readAuthJson(request));
    let buyerId: string | undefined; try { const actor = await getAuthenticatedActor(); buyerId = actor.roles.includes("buyer") ? actor.profileId : undefined; } catch { buyerId = undefined; }
    await consumeRateLimit("lead:contact:" + (input.email?.toLowerCase() || input.phone?.replace(/[^0-9]/g, "")), 5, 3600);
    return NextResponse.json({ data: await createLead(input, buyerId) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
