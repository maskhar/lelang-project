import { NextResponse } from "next/server";
import { getAuthenticatedActor } from "@/server/auth/actor";
import { apiErrorResponse } from "@/server/api";
import { mediaLibraryStats } from "@/server/media/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Terpisah dari daftar: kotak cari men-debounce daftar tiap 300ms, dan agregat seluruh tabel
// tidak perlu ikut dihitung ulang tiap ketikan.
export async function GET() {
  try {
    const data = await mediaLibraryStats(await getAuthenticatedActor());
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
