import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ error: { code: "API_RETIRED", message: "Gunakan /api/v1/media/{id}." } }, { status: 410, headers: { "Cache-Control": "no-store" } }); }
