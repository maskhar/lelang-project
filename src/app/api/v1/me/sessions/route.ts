import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { listActiveSessions } from "@/server/auth/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await getAuthenticatedActor();
    return NextResponse.json({ data: await listActiveSessions(actor.profileId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
