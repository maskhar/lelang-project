import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { propertyAuditTrail } from "@/server/properties/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Admin saja (dicek di propertyAuditTrail) — popup riwayat aktivitas per properti.
export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getAuthenticatedActor();
    const { id } = await context.params;
    const data = await propertyAuditTrail(actor, id);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
