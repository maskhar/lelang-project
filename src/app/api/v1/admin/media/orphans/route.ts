import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { deleteOrphanFile, scanOrphans } from "@/server/media/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scan sinkron: 1.549 file dalam 50 folder terbaca di bawah satu detik dan STORAGE_ROOT ter-mount di
// container app, jadi hasilnya bisa langsung ditampilkan tanpa perantara outbox + worker.
export async function GET() {
  try {
    const data = await scanOrphans(await getAuthenticatedActor());
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = await getAuthenticatedActor();
    const data = await deleteOrphanFile(actor, await readAuthJson(request));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
