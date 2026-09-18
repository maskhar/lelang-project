import { NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { properties, propertyAssignments, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { identifier } from "@/server/properties/validation";
import { assertListingAccess, denied, isStaff } from "@/server/properties/policy";

export const runtime="nodejs"; export const dynamic="force-dynamic";
// Agent boleh membaca detail hanya untuk properti yang sedang ditugaskan kepadanya; selain itu berlaku
// aturan assertListingAccess (staf bebas, owner hanya miliknya).
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const actor=requireRole(await getAuthenticatedActor(),"editor","admin","owner","agent");const id=identifier.parse((await context.params).id);const[property]=await getDatabase().select().from(properties).where(eq(properties.id,id));if(!property)throw new AuthHttpError(404,"NOT_FOUND","Properti tidak ditemukan.");if(!isStaff(actor)&&property.ownerId!==actor.profileId){if(!actor.roles.includes("agent"))throw denied();const[assignment]=await getDatabase().select({id:propertyAssignments.id}).from(propertyAssignments).where(and(eq(propertyAssignments.propertyId,id),eq(propertyAssignments.agentId,actor.profileId),isNull(propertyAssignments.unassignedAt))).limit(1);if(!assignment)throw denied();}else assertListingAccess(actor,property);const revisions=await getDatabase().select().from(propertyRevisions).where(eq(propertyRevisions.propertyId,id)).orderBy(desc(propertyRevisions.revisionNumber));const media=revisions.length?await getDatabase().select().from(propertyMedia).where(eq(propertyMedia.revisionId,revisions[0].id)):[];return NextResponse.json({data:{property,revisions,media,permissions:{canMarkSold:actor.roles.includes("admin")}}},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
