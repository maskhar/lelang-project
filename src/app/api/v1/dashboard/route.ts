import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { dashboardSummary } from "@/server/properties/service";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET() { try { return NextResponse.json({ data: await dashboardSummary(await getAuthenticatedActor()) }, { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiErrorResponse(error); } }
