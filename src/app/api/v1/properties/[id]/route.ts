import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { editListing, transitionListing } from "@/server/properties/service";
import { editInput, transitionInput } from "@/server/properties/validation";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireCsrf(request); const actor = await getAuthenticatedActor(); const { id } = await context.params; const input = editInput.parse(await readAuthJson(request)); return NextResponse.json({ data: await editListing(actor, id, input.version, input.listing) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { requireCsrf(request); const actor = await getAuthenticatedActor(); const { id } = await context.params; return NextResponse.json({ data: await transitionListing(actor, id, transitionInput.parse(await readAuthJson(request))) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }
