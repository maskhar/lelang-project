import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { identifier } from "@/server/properties/validation";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const actor=requireRole(await getAuthenticatedActor(),"editor","admin");const id=identifier.parse((await context.params).id);const[property]=await getDatabase().select().from(properties).where(eq(properties.id,id));if(!property)throw new AuthHttpError(404,"NOT_FOUND","Properti tidak ditemukan.");const revisions=await getDatabase().select().from(propertyRevisions).where(eq(propertyRevisions.propertyId,id)).orderBy(desc(propertyRevisions.revisionNumber));const media=revisions.length?await getDatabase().select().from(propertyMedia).where(eq(propertyMedia.revisionId,revisions[0].id)):[];return NextResponse.json({data:{property,revisions,media,permissions:{canMarkSold:actor.roles.includes("admin")}}},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
