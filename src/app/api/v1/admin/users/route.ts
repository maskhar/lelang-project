import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { profiles, userRoles } from "@/server/db/schema";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(){try{requireRole(await getAuthenticatedActor(),"admin");const data=await getDatabase().select({id:profiles.id,email:profiles.email,name:profiles.name,status:profiles.status,role:userRoles.role,createdAt:profiles.createdAt}).from(profiles).leftJoin(userRoles,eq(userRoles.userId,profiles.id)).orderBy(asc(profiles.email));return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
