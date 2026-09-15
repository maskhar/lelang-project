import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/server/api";
import { catalog } from "@/server/properties/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return NextResponse.json({ data: await catalog(request.nextUrl.searchParams) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(error); }
}
