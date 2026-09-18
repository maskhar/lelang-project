import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { manageableRoles, setAccountStatus, setRole } from "@/server/auth/admin-users";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { profiles, userRoles } from "@/server/db/schema";
import { adminPage, adminPageResult } from "@/server/admin-pagination";

export const runtime="nodejs"; export const dynamic="force-dynamic";
export async function GET(request:Request){try{requireRole(await getAuthenticatedActor(),"admin");const parameters=new URL(request.url).searchParams;const database=getDatabase();if(parameters.get("page")!=="1"){const data=await database.select({id:profiles.id,email:profiles.email,name:profiles.name,status:profiles.status,role:userRoles.role,createdAt:profiles.createdAt}).from(profiles).leftJoin(userRoles,eq(userRoles.userId,profiles.id)).orderBy(asc(profiles.email)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}const page=adminPage(parameters);const condition=and(page.q?or(ilike(profiles.email,"%"+page.q+"%"),ilike(profiles.name,"%"+page.q+"%")):undefined,page.status?eq(profiles.status,page.status as typeof profiles.status.enumValues[number]):undefined);const base=database.select({id:profiles.id,email:profiles.email,name:profiles.name,status:profiles.status,createdAt:profiles.createdAt}).from(profiles).where(condition).orderBy(asc(profiles.email),asc(profiles.id)).limit(page.limit+1).offset(page.offset);const profileRows=await base;const ids=profileRows.slice(0,page.limit).map((row)=>row.id);const roles=ids.length?await database.select().from(userRoles).where(sql`${userRoles.userId} in ${ids}`):[];const roleMap=new Map<string,string[]>();for(const role of roles)roleMap.set(role.userId,[...(roleMap.get(role.userId)||[]),role.role]);const[count]=await database.select({value:sql<number>`count(*)::integer`}).from(profiles).where(condition);const items=profileRows.map((row)=>({...row,roles:roleMap.get(row.id)||[]}));return NextResponse.json({data:adminPageResult(items,page.limit,page.offset,count.value)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
// Pemberian/pencabutan role dan enable/disable akun. Aksi destruktif terhadap akun admin sendiri
// ditolak di service (SELF_LOCKOUT) supaya selalu tersisa minimal satu admin aktif.
const roleBody=z.object({userId:z.string().uuid(),role:z.enum(manageableRoles)});
const statusBody=z.object({id:z.string().uuid(),status:z.enum(["active","disabled"])});
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=roleBody.parse(await readAuthJson(request));return NextResponse.json({data:await setRole(actor,value.userId,value.role,true)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function DELETE(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=roleBody.parse(await readAuthJson(request));return NextResponse.json({data:await setRole(actor,value.userId,value.role,false)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function PATCH(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=statusBody.parse(await readAuthJson(request));return NextResponse.json({data:await setAccountStatus(actor,value.id,value.status)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
