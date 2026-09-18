import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull, desc } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError, readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, profiles, propertyAssignments, properties, propertyRevisions, userRoles } from "@/server/db/schema";
export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{requireRole(await getAuthenticatedActor(),"admin");const data=await getDatabase().select({id:propertyAssignments.id,propertyId:properties.id,title:propertyRevisions.title,agentId:profiles.id,agentName:profiles.name,agentEmail:profiles.email,note:propertyAssignments.note,assignedAt:propertyAssignments.assignedAt}).from(propertyAssignments).innerJoin(properties,eq(properties.id,propertyAssignments.propertyId)).innerJoin(propertyRevisions,eq(propertyRevisions.propertyId,properties.id)).innerJoin(profiles,eq(profiles.id,propertyAssignments.agentId)).where(isNull(propertyAssignments.unassignedAt)).orderBy(desc(propertyAssignments.assignedAt)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}})}catch(e){return apiErrorResponse(e)}}
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"admin");const v=z.object({propertyId:z.string().uuid(),agentId:z.string().uuid(),note:z.string().trim().max(1000).optional()}).parse(await readAuthJson(request));const data=await getDatabase().transaction(async tx=>{
  const [property]=await tx.select({id:properties.id}).from(properties).where(eq(properties.id,v.propertyId)).limit(1);
  if(!property)throw new AuthHttpError(404,"NOT_FOUND","Properti tidak ditemukan.");
  const [agent]=await tx.select({id:profiles.id}).from(profiles).innerJoin(userRoles,and(eq(userRoles.userId,profiles.id),eq(userRoles.role,"agent"))).where(and(eq(profiles.id,v.agentId),eq(profiles.status,"active"))).limit(1);
  if(!agent)throw new AuthHttpError(422,"AGENT_INVALID","Akun tujuan bukan agent aktif.");
  const [duplicate]=await tx.select({id:propertyAssignments.id}).from(propertyAssignments).where(and(eq(propertyAssignments.propertyId,v.propertyId),eq(propertyAssignments.agentId,v.agentId),isNull(propertyAssignments.unassignedAt))).limit(1).for("update");
  if(duplicate)throw new AuthHttpError(409,"ASSIGNMENT_EXISTS","Agent ini sudah ditugaskan pada properti tersebut.");
  const [row]=await tx.insert(propertyAssignments).values({propertyId:v.propertyId,agentId:v.agentId,assignedBy:actor.profileId,note:v.note||null}).returning();
  await tx.insert(auditLogs).values({actorId:actor.profileId,action:"assignment.created",entityType:"property_assignment",entityId:row.id,metadata:{propertyId:v.propertyId,agentId:v.agentId}});
  return row;});return NextResponse.json({data},{status:201})}catch(e){return apiErrorResponse(e)}}
export async function DELETE(request:NextRequest){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"admin");const v=z.object({id:z.string().uuid()}).parse(await readAuthJson(request));await getDatabase().transaction(async tx=>{
  const [row]=await tx.select().from(propertyAssignments).where(and(eq(propertyAssignments.id,v.id),isNull(propertyAssignments.unassignedAt))).limit(1).for("update");
  if(!row)throw new AuthHttpError(404,"NOT_FOUND","Penugasan tidak ditemukan atau sudah dicabut.");
  await tx.update(propertyAssignments).set({unassignedAt:new Date()}).where(eq(propertyAssignments.id,row.id));
  await tx.insert(auditLogs).values({actorId:actor.profileId,action:"assignment.removed",entityType:"property_assignment",entityId:row.id,metadata:{propertyId:row.propertyId,agentId:row.agentId}});});return new NextResponse(null,{status:204})}catch(e){return apiErrorResponse(e)}}
