import { NextResponse } from "next/server";
import { and, eq, isNull, desc } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { propertyAssignments, properties, propertyRevisions } from "@/server/db/schema";
export async function GET(){try{const actor=requireRole(await getAuthenticatedActor(),"agent");const data=await getDatabase().select({id:propertyAssignments.id,propertyId:properties.id,title:propertyRevisions.title,assignedAt:propertyAssignments.assignedAt}).from(propertyAssignments).innerJoin(properties,eq(properties.id,propertyAssignments.propertyId)).innerJoin(propertyRevisions,eq(propertyRevisions.propertyId,properties.id)).where(and(eq(propertyAssignments.agentId,actor.profileId),isNull(propertyAssignments.unassignedAt))).orderBy(desc(propertyAssignments.assignedAt));return NextResponse.json({data})}catch(e){return apiErrorResponse(e)}}
