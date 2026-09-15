import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{requireRole(await getAuthenticatedActor(),"admin");const data=await getDatabase().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
