import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { mediaLibraryPage } from "@/server/media/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const data = await mediaLibraryPage(await getAuthenticatedActor(), new URL(request.url).searchParams);
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
