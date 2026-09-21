import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { manageableRoles, setAccountStatus, setRole } from "@/server/auth/admin-users";
import { parseUserListQuery, roleSortRank, type UserRoleFilter, type UserSortKey } from "@/server/auth/admin-user-list";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { profiles, userRoles } from "@/server/db/schema";
import { adminPage, adminPageResult } from "@/server/admin-pagination";

export const runtime="nodejs"; export const dynamic="force-dynamic";

// Peringkat role sebagai satu ekspresi SQL, dibangun dari roleSortRank supaya angkanya tidak dobel
// didefinisikan. Satu akun bisa punya beberapa role, jadi yang dipakai min() — peringkat tertinggi yang
// dimiliki. Akun tanpa role dapat 99 supaya jatuh di akhir, bukan di depan seperti NULL pada ASC.
//
// ::int wajib pada tiap angka: driver pg mengirim parameter sebagai text, dan tanpa cast Postgres menolak
// seluruh query dengan "COALESCE types text and integer cannot be matched".
//
// Korelasi ke profiles ditulis "ur.user_id = app.profiles.id" penuh, bukan lewat ${profiles.id}: drizzle
// mencetak kolom di dalam subquery tanpa kualifikasi tabel, jadi hasilnya `where "user_id" = "id"` — hari
// ini kebetulan benar karena user_roles tidak punya kolom id, tapi akan salah diam-diam kalau nanti punya.
const roleRank = sql<number>`coalesce((select min(case ${sql.join(Object.entries(roleSortRank).map(([role, rank]) => sql`when ur.role = ${role} then ${rank}::int`), sql` `)} end) from app.user_roles ur where ur.user_id = app.profiles.id), 99)`;
// Tiebreaker id wajib di setiap urutan: tanpa itu baris dengan nilai kunci sama bisa berpindah halaman
// antar permintaan offset dan satu akun tampil dua kali (atau hilang).
const ordering: Record<UserSortKey, SQL[]> = {
  email: [asc(profiles.email), asc(profiles.id)],
  nama: [asc(profiles.name), asc(profiles.email), asc(profiles.id)],
  terbaru: [desc(profiles.createdAt), desc(profiles.id)],
  terlama: [asc(profiles.createdAt), asc(profiles.id)],
  role: [asc(roleRank), asc(profiles.email), asc(profiles.id)],
};

// Filter role lewat exists(), bukan join: join ke user_roles menggandakan baris profil yang punya beberapa
// role (produksi: 26 baris role untuk 15 akun) sehingga limit/offset dan total ikut salah hitung.
// Kualifikasi tabel ditulis penuh dengan alasan yang sama seperti roleRank di atas.
function roleCondition(filter: UserRoleFilter | undefined) {
  if (!filter) return undefined;
  const owner = sql`select 1 from app.user_roles ur where ur.user_id = app.profiles.id`;
  const owned = filter === "tanpa_role" ? owner : sql`${owner} and ur.role = ${filter}`;
  return filter === "tanpa_role" ? sql`not exists (${owned})` : sql`exists (${owned})`;
}

export async function GET(request:Request){try{requireRole(await getAuthenticatedActor(),"admin");const parameters=new URL(request.url).searchParams;const database=getDatabase();if(parameters.get("page")!=="1"){const data=await database.select({id:profiles.id,email:profiles.email,name:profiles.name,status:profiles.status,role:userRoles.role,createdAt:profiles.createdAt}).from(profiles).leftJoin(userRoles,eq(userRoles.userId,profiles.id)).orderBy(asc(profiles.email)).limit(200);return NextResponse.json({data},{headers:{"Cache-Control":"no-store"}});}const page=adminPage(parameters);const filters=parseUserListQuery(page);const condition=and(page.q?or(ilike(profiles.email,"%"+page.q+"%"),ilike(profiles.name,"%"+page.q+"%")):undefined,filters.status?eq(profiles.status,filters.status):undefined,roleCondition(filters.role));const profileRows=await database.select({id:profiles.id,email:profiles.email,name:profiles.name,status:profiles.status,createdAt:profiles.createdAt}).from(profiles).where(condition).orderBy(...ordering[filters.sort]).limit(page.limit+1).offset(page.offset);const ids=profileRows.slice(0,page.limit).map((row)=>row.id);const roles=ids.length?await database.select().from(userRoles).where(sql`${userRoles.userId} in ${ids}`):[];const roleMap=new Map<string,string[]>();for(const role of roles)roleMap.set(role.userId,[...(roleMap.get(role.userId)||[]),role.role]);const[count]=await database.select({value:sql<number>`count(*)::integer`}).from(profiles).where(condition);const items=profileRows.map((row)=>({...row,roles:roleMap.get(row.id)||[]}));return NextResponse.json({data:adminPageResult(items,page.limit,page.offset,count.value)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
// Pemberian/pencabutan role dan enable/disable akun. Aksi destruktif terhadap akun admin sendiri
// ditolak di service (SELF_LOCKOUT) supaya selalu tersisa minimal satu admin aktif.
const roleBody=z.object({userId:z.string().uuid(),role:z.enum(manageableRoles)});
const statusBody=z.object({id:z.string().uuid(),status:z.enum(["active","disabled"])});
export async function POST(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=roleBody.parse(await readAuthJson(request));return NextResponse.json({data:await setRole(actor,value.userId,value.role,true)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function DELETE(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=roleBody.parse(await readAuthJson(request));return NextResponse.json({data:await setRole(actor,value.userId,value.role,false)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
export async function PATCH(request:NextRequest){try{requireCsrf(request);const actor=await getAuthenticatedActor();const value=statusBody.parse(await readAuthJson(request));return NextResponse.json({data:await setAccountStatus(actor,value.id,value.status)},{headers:{"Cache-Control":"no-store"}});}catch(error){return apiErrorResponse(error);}}
