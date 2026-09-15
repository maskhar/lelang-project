import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function retired() { return NextResponse.json({ error: { code: "API_RETIRED", message: "Gunakan /api/v1/properties atau /api/v1/properties/public." } }, { status: 410, headers: { "Cache-Control": "no-store" } }); }
export async function GET() { return retired(); }
export async function POST() { return retired(); }
