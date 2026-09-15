import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson, AuthHttpError } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, leads } from "@/server/db/schema";
import { identifier, leadEditInput } from "@/server/properties/validation";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function PATCH(request:NextRequest,context:{params:Promise<{id:string}>}){try{requireCsrf(request);const actor=requireRole(await getAuthenticatedActor(),"editor","admin");const id=identifier.parse((await context.params).id);const input=leadEditInput.parse(await readAuthJson(request));const result=await getDatabase().transaction(async(transaction)=>{const[lead]=await transaction.update(leads).set({status:input.status,updatedAt:new Date()}).where(eq(leads.id,id)).returning();if(!lead)throw new AuthHttpError(404,"NOT_FOUND","Lead tidak ditemukan.");await transaction.insert(auditLogs).values({actorId:actor.profileId,action:"lead.status.changed",entityType:"lead",entityId:id,metadata:{status:input.status}});return lead;});return NextResponse.json({data:result},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
