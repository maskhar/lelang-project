import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { markListingAvailable, markListingSold } from "@/server/properties/service";

export const runtime = "nodejs";
// action dipisah dari body yang diteruskan ke service: skema service tetap strict {version, reason},
// dan tanpa action perilaku lama (tandai terjual) tidak berubah.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor();
    const { id } = await context.params;
    const body = await readAuthJson(request);
    const { action, ...rest } = (body && typeof body === "object" ? body : {}) as { action?: unknown };
    const data = action === "available" ? await markListingAvailable(actor, id, rest) : await markListingSold(actor, id, rest);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
