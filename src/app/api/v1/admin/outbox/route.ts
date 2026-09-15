import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError, readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, outboxEvents } from "@/server/db/schema";
import { adminPage, adminPageResult } from "@/server/admin-pagination";

export const runtime="nodejs"; export const dynamic="force-dynamic";
const inputSchema=z.object({id:z.uuid()}).strict();
export async function GET(request:Request){try{requireRole(await getAuthenticatedActor(),"admin");const parameters=new URL(request.url).searchParams;if(parameters.get("page")!=="1"){const data=await getDatabase().select().from(outboxEvents).orderBy(desc(outboxEvents.createdAt)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}const page=adminPage(parameters);const condition=and(page.q?ilike(outboxEvents.type,"%"+page.q+"%"):undefined,page.status?eq(outboxEvents.status,page.status as typeof outboxEvents.status.enumValues[number]):undefined);const database=getDatabase();const rows=await database.select().from(outboxEvents).where(condition).orderBy(desc(outboxEvents.createdAt),desc(outboxEvents.id)).limit(page.limit+1).offset(page.offset);const[count]=await database.select({value:sql<number>`count(*)::integer`}).from(outboxEvents).where(condition);return NextResponse.json({data:adminPageResult(rows,page.limit,page.offset,count.value)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function PATCH(request:NextRequest){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"admin");const{id}=inputSchema.parse(await readAuthJson(request));const data=await getDatabase().transaction(async(transaction)=>{const[event]=await transaction.select().from(outboxEvents).where(eq(outboxEvents.id,id)).for("update");if(!event)throw new AuthHttpError(404,"NOT_FOUND","Event tidak ditemukan.");if(event.status!=="dead_letter")throw new AuthHttpError(409,"INVALID_OUTBOX_STATUS","Hanya dead-letter dapat diulang.");await transaction.update(outboxEvents).set({status:"pending",attempts:0,availableAt:new Date(),processedAt:null,lastError:null}).where(eq(outboxEvents.id,id));await transaction.insert(auditLogs).values({actorId:actor.profileId,action:"outbox.retried",entityType:"outbox_event",entityId:id});return{id,status:"pending"};});return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
