import { NextResponse } from "next/server";
import { getDatabasePool } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();

  try {
    await getDatabasePool().query("select 1");
    return NextResponse.json({ status: "ready", database: "ok", durationMs: Date.now() - startedAt }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "not_ready", database: "unavailable", durationMs: Date.now() - startedAt }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
