import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { accessRequests, auditLogs } from "@/server/db/schema";
import { z } from "zod";
export const runtime="nodejs"; export const dynamic="force-dynamic";
const input=z.object({requestedRole:z.enum(["owner","agent","buyer"]),reason:z.string().trim().min(10).max(1000)});
export async function GET(){try{const actor=await getAuthenticatedActor({ allowNoRole: true });const data=await getDatabase().select().from(accessRequests).where(eq(accessRequests.profileId,actor.profileId)).orderBy(desc(accessRequests.createdAt));return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=input.parse(await readAuthJson(request));const database=getDatabase();const existing=await database.select({id:accessRequests.id}).from(accessRequests).where(and(eq(accessRequests.profileId,actor.profileId),eq(accessRequests.status,"pending"))).limit(1);if(existing.length)throw new Error("Masih ada pengajuan yang sedang diproses.");const [data]=await database.transaction(async tx=>{const [request]=await tx.insert(accessRequests).values({profileId:actor.profileId,requestedRole:value.requestedRole,reason:value.reason}).returning();await tx.insert(auditLogs).values({actorId:actor.profileId,action:"access_request.created",entityType:"access_request",entityId:request.id});return [request]});return NextResponse.json({data},{status:201});}catch(error){return apiErrorResponse(error);}}
