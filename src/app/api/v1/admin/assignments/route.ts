import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { profiles, propertyAssignments, properties, propertyRevisions } from "@/server/db/schema";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{requireRole(await getAuthenticatedActor(),"admin");const data=await getDatabase().select({id:propertyAssignments.id,propertyId:properties.id,title:propertyRevisions.title,agentId:profiles.id,agentName:profiles.name,assignedAt:propertyAssignments.assignedAt}).from(propertyAssignments).innerJoin(properties,eq(properties.id,propertyAssignments.propertyId)).innerJoin(propertyRevisions,eq(propertyRevisions.propertyId,properties.id)).innerJoin(profiles,eq(profiles.id,propertyAssignments.agentId)).where(isNull(propertyAssignments.unassignedAt)).orderBy(desc(propertyAssignments.assignedAt));return NextResponse.json({data})}catch(e){return apiErrorResponse(e)}}
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"admin");const v=z.object({propertyId:z.string().uuid(),agentId:z.string().uuid(),note:z.string().max(1000).optional()}).parse(await readAuthJson(request));const [row]=await getDatabase().insert(propertyAssignments).values({propertyId:v.propertyId,agentId:v.agentId,assignedBy:actor.profileId,note:v.note}).returning();return NextResponse.json({data:row},{status:201})}catch(e){return apiErrorResponse(e)}}
