import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { bulkArchiveListings, staffListings } from "@/server/properties/service";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { try { const params = request.nextUrl.searchParams; return NextResponse.json({ data: await staffListings(await getAuthenticatedActor(), { status: params.get("status") || undefined, q: params.get("q") || undefined }) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }

export async function PATCH(request: NextRequest) { try { requireCsrf(request); const actor = await getAuthenticatedActor(); const body = await readAuthJson(request) as { ids: string[] }; return NextResponse.json({ data: await bulkArchiveListings(actor, body.ids) }); } catch (error) { return apiErrorResponse(error); } }
