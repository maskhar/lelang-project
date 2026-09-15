import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { createListing } from "@/server/properties/service";
import { listingInput } from "@/server/properties/validation";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export { GET } from "./public/route";
export async function POST(request: NextRequest) { try { requireCsrf(request); const actor = await getAuthenticatedActor(); const input = listingInput.parse(await readAuthJson(request)); return NextResponse.json({ data: await createListing(actor, input) }, { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }
