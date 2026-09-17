import { NextResponse } from "next/server";
import { dashboardLeads } from "@/server/properties/service";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";


export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{const data=await dashboardLeads(await getAuthenticatedActor());return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
