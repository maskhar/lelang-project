import { NextResponse } from "next/server";
import { AuthenticationError, AuthorizationError, getAuthenticatedActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await getAuthenticatedActor();
    return NextResponse.json({ data: actor }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: error.message } }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (error instanceof AuthorizationError) return NextResponse.json({ error: { code: "FORBIDDEN", message: error.message } }, { status: 403, headers: { "Cache-Control": "no-store" } });

    console.error("Load current actor failed.");
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Gagal memuat sesi." } }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
