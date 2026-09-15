import { NextResponse } from "next/server";
import { desc, ilike, or, sql } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { adminPage, adminPageResult } from "@/server/admin-pagination";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){try{requireRole(await getAuthenticatedActor(),"admin");const parameters=new URL(request.url).searchParams;if(parameters.get("page")!=="1"){const data=await getDatabase().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}const page=adminPage(parameters);const condition=page.q?or(ilike(auditLogs.action,"%"+page.q+"%"),ilike(auditLogs.entityType,"%"+page.q+"%")):undefined;const database=getDatabase();const rows=await database.select().from(auditLogs).where(condition).orderBy(desc(auditLogs.createdAt),desc(auditLogs.id)).limit(page.limit+1).offset(page.offset);const[count]=await database.select({value:sql<number>`count(*)::integer`}).from(auditLogs).where(condition);return NextResponse.json({data:adminPageResult(rows,page.limit,page.offset,count.value)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
