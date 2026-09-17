import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { properties, propertyRevisions, propertyWatchlists } from "@/server/db/schema";
export const runtime="nodejs"; export const dynamic="force-dynamic";
async function buyer(){return requireRole(await getAuthenticatedActor(),"buyer");}
export async function GET(){try{const actor=await buyer();const data=await getDatabase().select({propertyId:properties.id,slug:properties.slug,title:propertyRevisions.title,askingPrice:properties.askingPrice,createdAt:propertyWatchlists.createdAt}).from(propertyWatchlists).innerJoin(properties,eq(properties.id,propertyWatchlists.propertyId)).innerJoin(propertyRevisions,eq(propertyRevisions.id,properties.publishedRevisionId)).where(eq(propertyWatchlists.buyerId,actor.profileId)).orderBy(desc(propertyWatchlists.createdAt));return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}})}catch(error){return apiErrorResponse(error)}}
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=await buyer();const {propertyId}=z.object({propertyId:z.string().uuid()}).parse(await readAuthJson(request));const [property]=await getDatabase().select({id:properties.id}).from(properties).where(and(eq(properties.id,propertyId),eq(properties.publicationStatus,"published"))).limit(1);if(!property)return NextResponse.json({error:{code:"NOT_FOUND",message:"Properti tidak tersedia."}},{status:404});await getDatabase().insert(propertyWatchlists).values({buyerId:actor.profileId,propertyId}).onConflictDoNothing();return NextResponse.json({data:{propertyId}},{status:201})}catch(error){return apiErrorResponse(error)}}
export async function DELETE(request:NextRequest){try{requireCsrf(request);const actor=await buyer();const {propertyId}=z.object({propertyId:z.string().uuid()}).parse(await readAuthJson(request));await getDatabase().delete(propertyWatchlists).where(and(eq(propertyWatchlists.buyerId,actor.profileId),eq(propertyWatchlists.propertyId,propertyId)));return new NextResponse(null,{status:204})}catch(error){return apiErrorResponse(error)}}
