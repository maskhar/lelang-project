import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/server/db/client";
import { properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { readPublic } from "@/server/storage/local";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){try{const{id}=await context.params;const[media]=await getDatabase().select({objectPath:propertyMedia.objectPath,contentType:propertyMedia.contentType}).from(propertyMedia).innerJoin(propertyRevisions,eq(propertyMedia.revisionId,propertyRevisions.id)).innerJoin(properties,eq(properties.publishedRevisionId,propertyRevisions.id)).where(and(eq(propertyMedia.id,id),eq(propertyMedia.status,"ready"),eq(properties.publicationStatus,"published")));if(!media)return new NextResponse(null,{status:404});return new NextResponse(await readPublic(media.objectPath),{headers:{"Content-Type":media.contentType,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}catch{return new NextResponse(null,{status:404});}}
