import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { revealLeadContact } from "@/server/properties/service";
import { apiErrorResponse } from "@/server/api";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
// POST, bukan GET: reveal kontak menulis audit_logs (lead.contact.viewed), jadi diperlakukan
// sebagai aksi bertanda tangan CSRF, sama seperti PATCH status pada ../route.ts.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor();
    const { id } = await context.params;
    return NextResponse.json({ data: await revealLeadContact(actor, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
