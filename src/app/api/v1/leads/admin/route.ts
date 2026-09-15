import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { leads } from "@/server/db/schema";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{requireRole(await getAuthenticatedActor(),"editor","admin");const data=await getDatabase().select().from(leads).orderBy(desc(leads.createdAt)).limit(100);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
