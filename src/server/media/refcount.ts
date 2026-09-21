import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { getDatabase } from "@/server/db/client";
import { propertyMedia } from "@/server/db/schema";
import { discard, discardPublic, statObject } from "@/server/storage/local";

// Sejak 0016 revisi berbagi file fisik (editListing tidak lagi menggandakan foto lewat copyPublic), jadi satu
// (bucket, object_path) bisa dipakai banyak baris property_media. File hanya boleh dihapus dari disk kalau tidak
// ada baris lain yang menunjuk path itu. Ini satu-satunya pintu penghapusan fisik media; jangan panggil
// discardPublic/discard langsung untuk file media.
//
// Refcount DIHITUNG, bukan disimpan sebagai kolom: property_media.revision_id memakai on delete cascade, jadi
// baris bisa hilang lewat Postgres tanpa melewati kode aplikasi dan angka tersimpan apa pun pasti bocor.
// Index property_media_object_idx yang membuat hitungan ini murah.

export type PathRef = { bucket: string; objectPath: string };
type Executor = Pick<ReturnType<typeof getDatabase>, "select">;

const key = (file: PathRef) => file.bucket + ":" + file.objectPath;

async function unlink(file: PathRef) {
  await (file.bucket === "public" ? discardPublic(file.objectPath) : discard(file.objectPath));
}

// Hapus file fisik hanya bila tidak ada baris property_media lain yang menunjuknya.
//
// ignoreMediaId: media.cleanup berjalan ketika barisnya sendiri masih ada dengan status 'deleted', jadi baris itu
// harus dikecualikan dari hitungan. Baris 'deleted' milik revisi LAIN tetap dihitung sebagai pemakai — selama
// ada baris yang mencatat path itu, file belum boleh hilang.
export async function discardIfUnreferenced(
  executor: Executor,
  file: PathRef,
  options?: { ignoreMediaId?: string },
): Promise<"discarded" | "kept"> {
  const conditions = [eq(propertyMedia.bucket, file.bucket), eq(propertyMedia.objectPath, file.objectPath)];
  if (options?.ignoreMediaId) conditions.push(ne(propertyMedia.id, options.ignoreMediaId));
  const [row] = await executor.select({ users: sql<number>`count(*)::integer` }).from(propertyMedia).where(and(...conditions));
  if ((row?.users ?? 0) > 0) return "kept";
  await unlink(file);
  return "discarded";
}

// Versi murni untuk penghapusan borongan: diberi baris yang akan/sudah hilang dan baris yang masih ada,
// tentukan path mana yang boleh di-unlink. Path duplikat dalam `removed` muncul sekali saja — 6 revisi yang
// menunjuk 19 foto yang sama menghasilkan 19 unlink, bukan 114. Bucket ikut jadi kunci: path yang sama di
// public dan quarantine adalah dua file berbeda.
export function unreferencedPaths(removed: PathRef[], remaining: PathRef[]): PathRef[] {
  const kept = new Set(remaining.map(key));
  const result: PathRef[] = [];
  const seen = new Set<string>();
  for (const file of removed) {
    const id = key(file);
    if (kept.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push({ bucket: file.bucket, objectPath: file.objectPath });
  }
  return result;
}

// Hapus banyak file sekaligus setelah barisnya hilang dari DB. Dipakai deleteListings: path milik properti yang
// dihapus dibandingkan dengan baris yang masih ada di property_media (milik properti lain, atau revisi yang tidak
// ikut terhapus), lalu hanya yang benar-benar tak terpakai yang di-unlink. Kegagalan rm sengaja ditelan: yang
// tertinggal adalah file tak terpakai (terdeteksi scan orphan, bisa dihapus dari UI), bukan baris DB yang
// menunjuk file hilang.
export async function discardUnreferenced(executor: Executor, removed: PathRef[]): Promise<PathRef[]> {
  const candidates = unreferencedPaths(removed, []);
  if (!candidates.length) return [];
  // Ditanya per object_path saja (bukan pasangan tuple dengan bucket) supaya satu query sederhana cukup; bucket
  // disaring di unreferencedPaths. Kelebihan baris yang terbawa tidak berbahaya, hanya membuat lebih banyak path
  // dianggap masih terpakai kalau ada tabrakan nama antar bucket — arah yang aman.
  const stillUsed = await executor
    .select({ bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath })
    .from(propertyMedia)
    .where(inArray(propertyMedia.objectPath, candidates.map((file) => file.objectPath)));
  const deletable = unreferencedPaths(candidates, stillUsed);
  const discarded: PathRef[] = [];
  for (const file of deletable) {
    // Path yang filenya sudah tidak ada (baris 'deleted' yang worker sudah bereskan) tidak dihitung: rm({force})
    // sukses tanpa protes, dan melaporkannya sebagai "terhapus" bikin angka di UI lebih besar dari kenyataan.
    if (!(await statObject(file.bucket as "public" | "quarantine", file.objectPath))) continue;
    await unlink(file).catch(() => undefined);
    discarded.push(file);
  }
  return discarded;
}
