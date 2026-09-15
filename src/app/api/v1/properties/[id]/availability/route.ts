import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { markListingSold } from "@/server/properties/service";

export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor();
    const { id } = await context.params;
    const data = await markListingSold(actor, id, await readAuthJson(request));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
