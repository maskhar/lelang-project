import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson, AuthHttpError } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, leads, properties, propertyAssignments } from "@/server/db/schema";
import { identifier, leadEditInput } from "@/server/properties/validation";
import { isStaff } from "@/server/properties/policy";

export const runtime="nodejs"; export const dynamic="force-dynamic";
// Non-staf boleh mengubah status lead hanya bila properti terkait ditugaskan kepadanya (agent) atau miliknya (owner).
// Aktor dengan role owner+agent lolos bila salah satu syarat terpenuhi.
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"editor","admin","agent","owner");const id=identifier.parse((await context.params).id);const input=leadEditInput.parse(await readAuthJson(request));const result=await getDatabase().transaction(async(transaction)=>{
  const [existing]=await transaction.select({id:leads.id,propertyId:leads.propertyId,ownerId:properties.ownerId}).from(leads).innerJoin(properties,eq(properties.id,leads.propertyId)).where(eq(leads.id,id)).limit(1);
  if(!existing)throw new AuthHttpError(404,"NOT_FOUND","Lead tidak ditemukan.");
  if(!isStaff(actor)){
    const owns=actor.roles.includes("owner")&&existing.ownerId===actor.profileId;
    const [assignment]=owns||!actor.roles.includes("agent")?[undefined]:await transaction.select({id:propertyAssignments.id}).from(propertyAssignments).where(and(eq(propertyAssignments.propertyId,existing.propertyId),eq(propertyAssignments.agentId,actor.profileId),isNull(propertyAssignments.unassignedAt))).limit(1);
    if(!owns&&!assignment)throw new AuthHttpError(403,"FORBIDDEN","Lead ini bukan milik properti Anda atau yang ditugaskan kepada Anda.");
  }
  const[lead]=await transaction.update(leads).set({status:input.status,updatedAt:new Date()}).where(eq(leads.id,id)).returning();
  await transaction.insert(auditLogs).values({actorId:actor.profileId,action:"lead.status.changed",entityType:"lead",entityId:id,metadata:{status:input.status}});
  return lead;});return NextResponse.json({data:result},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
