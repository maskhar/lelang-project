import "server-only";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireRole, type Actor } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { adminPage, adminPageResult } from "@/server/admin-pagination";
import { getDatabase } from "@/server/db/client";
import { auditLogs, properties, propertyMedia, propertyRevisions } from "@/server/db/schema";
import { discard, discardPublic, listStoredObjects, statObject } from "@/server/storage/local";
import { classifyOrphans, type MediaRowRef } from "./orphans";

// Media "terpakai" = menempel pada revisi yang sedang terbit. Sisanya menempel di draft/revisi lama:
// editListing() menurunkan foto revisi lama ke revisi baru, dan sejak 0016 barisnya menunjuk file fisik yang
// SAMA. Jadi satu baris tidak lagi berarti satu file di disk — hitungan baris ("tercatat") dan pemakaian disk
// sesungguhnya ("nyata di disk", dihitung atas object_path distinct) memang berbeda angkanya.
// `is not distinct from`, bukan `=`: properti yang belum pernah terbit punya published_revision_id NULL,
// dan `NULL = id` menghasilkan NULL sehingga barisnya jatuh dari filter "terpakai" maupun "tidak terpakai"
// (total kedua kartu jadi tidak sama dengan total file). Bentuk ini mengembalikan false, bukan NULL.
const usedInPublished = sql`${properties.publishedRevisionId} is not distinct from ${propertyRevisions.id}`;
const live = sql`${propertyMedia.status} <> 'deleted'`;

export async function mediaLibraryStats(actor: Actor) {
  requireRole(actor, "admin");
  const database = getDatabase();
  const [totals] = await database
    .select({
      files: sql<number>`count(*) filter (where ${live})::integer`,
      bytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}) filter (where ${live}), 0)::bigint`,
      usedFiles: sql<number>`count(*) filter (where ${live} and ${usedInPublished})::integer`,
      usedBytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}) filter (where ${live} and ${usedInPublished}), 0)::bigint`,
      unusedFiles: sql<number>`count(*) filter (where ${live} and not ${usedInPublished})::integer`,
      unusedBytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}) filter (where ${live} and not ${usedInPublished}), 0)::bigint`,
      deletedFiles: sql<number>`count(*) filter (where ${propertyMedia.status} = 'deleted')::integer`,
      deletedBytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}) filter (where ${propertyMedia.status} = 'deleted'), 0)::bigint`,
      // Konten unik: berapa banyak file yang benar-benar berbeda isinya. Checksum nullable (baris lama),
      // jadi baris tanpa checksum dihitung sebagai unik sendiri-sendiri lewat coalesce ke id.
      uniqueFiles: sql<number>`count(distinct coalesce(${propertyMedia.checksumSha256}, ${propertyMedia.id}::text)) filter (where ${live})::integer`,
    })
    .from(propertyMedia)
    .innerJoin(propertyRevisions, eq(propertyRevisions.id, propertyMedia.revisionId))
    .innerJoin(properties, eq(properties.id, propertyRevisions.propertyId));
  // Pemakaian disk sesungguhnya. Sejak 0016 banyak baris menunjuk satu file, jadi sum(size_bytes) per baris
  // melebih-lebihkan: satu foto 3 MB yang dipakai 6 revisi terhitung 18 MB padahal di disk cuma 3 MB. Dihitung
  // atas (bucket, object_path) distinct. Baris 'deleted' dikecualikan — sama seperti kartu lain — karena filenya
  // sudah atau segera dihapus worker; angka ini harus cocok dengan jumlah file yang dilihat scan orphan.
  const disk = await database.execute<{ files: number; bytes: string }>(sql`
    select count(*)::integer as files, coalesce(sum(size_bytes), 0)::bigint as bytes
    from (select distinct on (bucket, object_path) bucket, object_path, size_bytes
          from app.property_media where status <> 'deleted') as unik`);
  const byStatus = await database
    .select({ status: propertyMedia.status, count: sql<number>`count(*)::integer`, bytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}), 0)::bigint` })
    .from(propertyMedia)
    .groupBy(propertyMedia.status)
    .orderBy(propertyMedia.status);
  const byType = await database
    .select({ contentType: propertyMedia.contentType, count: sql<number>`count(*)::integer`, bytes: sql<number>`coalesce(sum(${propertyMedia.sizeBytes}), 0)::bigint` })
    .from(propertyMedia)
    .where(live)
    .groupBy(propertyMedia.contentType)
    .orderBy(desc(sql`count(*)`));
  // sum() bigint kembali sebagai string dari pg; dinormalisasi di sini supaya client tidak perlu tahu.
  const number = (value: unknown) => Number(value ?? 0);
  return {
    files: number(totals?.files), bytes: number(totals?.bytes),
    usedFiles: number(totals?.usedFiles), usedBytes: number(totals?.usedBytes),
    unusedFiles: number(totals?.unusedFiles), unusedBytes: number(totals?.unusedBytes),
    deletedFiles: number(totals?.deletedFiles), deletedBytes: number(totals?.deletedBytes),
    uniqueFiles: number(totals?.uniqueFiles),
    diskFiles: number(disk.rows[0]?.files), diskBytes: number(disk.rows[0]?.bytes),
    byStatus: byStatus.map((row) => ({ status: row.status, count: number(row.count), bytes: number(row.bytes) })),
    byType: byType.map((row) => ({ contentType: row.contentType, count: number(row.count), bytes: number(row.bytes) })),
  };
}

// Nilai "terpakai"/"tidak_terpakai" ditumpangkan ke parameter `status` milik adminPage supaya skema .strict()
// di admin-pagination tidak perlu diperluas hanya untuk satu halaman.
const mediaStatuses = ["pending", "ready", "rejected", "deleted"] as const;
const usageFilters = ["terpakai", "tidak_terpakai"] as const;

export async function mediaLibraryPage(actor: Actor, parameters: URLSearchParams) {
  requireRole(actor, "admin");
  const page = adminPage(parameters);
  const filter = page.status ?? "";
  if (filter && !mediaStatuses.includes(filter as (typeof mediaStatuses)[number]) && !usageFilters.includes(filter as (typeof usageFilters)[number])) {
    throw new AuthHttpError(422, "INVALID_QUERY", "Filter status tidak dikenal.");
  }
  const conditions = [];
  if (page.q) conditions.push(or(ilike(properties.sku, "%" + page.q + "%"), ilike(propertyRevisions.title, "%" + page.q + "%"), ilike(propertyMedia.objectPath, "%" + page.q + "%")));
  if (mediaStatuses.includes(filter as (typeof mediaStatuses)[number])) conditions.push(eq(propertyMedia.status, filter as (typeof mediaStatuses)[number]));
  if (filter === "terpakai") conditions.push(and(live, usedInPublished));
  if (filter === "tidak_terpakai") conditions.push(and(live, sql`not ${usedInPublished}`));
  const condition = conditions.length ? and(...conditions) : undefined;
  const database = getDatabase();
  const rows = await database
    .select({
      id: propertyMedia.id, bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath, contentType: propertyMedia.contentType,
      sizeBytes: propertyMedia.sizeBytes, status: propertyMedia.status, isCover: propertyMedia.isCover, createdAt: propertyMedia.createdAt,
      propertyId: properties.id, slug: properties.slug, sku: properties.sku, title: propertyRevisions.title,
      revisionNumber: propertyRevisions.revisionNumber, publishedRevision: sql<boolean>`${usedInPublished}`,
    })
    .from(propertyMedia)
    .innerJoin(propertyRevisions, eq(propertyRevisions.id, propertyMedia.revisionId))
    .innerJoin(properties, eq(properties.id, propertyRevisions.propertyId))
    .where(condition)
    // Tiebreaker id wajib: tanpa itu urutan baris dengan created_at sama tidak stabil antar halaman offset.
    .orderBy(desc(propertyMedia.createdAt), desc(propertyMedia.id))
    .limit(page.limit + 1)
    .offset(page.offset);
  const [count] = await database
    .select({ value: sql<number>`count(*)::integer` })
    .from(propertyMedia)
    .innerJoin(propertyRevisions, eq(propertyRevisions.id, propertyMedia.revisionId))
    .innerJoin(properties, eq(properties.id, propertyRevisions.propertyId))
    .where(condition);
  return adminPageResult(rows.map((row) => ({ ...row, sizeBytes: Number(row.sizeBytes) })), page.limit, page.offset, count.value);
}

export async function scanOrphans(actor: Actor) {
  requireRole(actor, "admin");
  // Scan membaca seluruh isi disk; kuota per admin menahan tombol yang diklik berulang-ulang.
  await consumeRateLimit("media:scan:" + actor.profileId, 6, 300);
  const rows = await getDatabase().select({ id: propertyMedia.id, bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath, status: propertyMedia.status }).from(propertyMedia);
  const [publicBucket, quarantineBucket] = await Promise.all([listStoredObjects("public"), listStoredObjects("quarantine")]);
  const report = classifyOrphans(rows as MediaRowRef[], [...publicBucket.objects, ...quarantineBucket.objects]);
  return {
    ...report,
    scannedAt: new Date().toISOString(),
    scannedFiles: publicBucket.objects.length + quarantineBucket.objects.length,
    scannedRows: rows.length,
    truncated: publicBucket.truncated || quarantineBucket.truncated,
  };
}

// Pola objectPath menyalin penjaga di filePath(): tanpa ini path traversal tetap ditolak, tapi jatuh
// sebagai Error biasa yang apiErrorResponse terjemahkan jadi 503 — menyesatkan untuk input yang jelas salah.
const deleteInput = z.object({
  bucket: z.enum(["public", "quarantine"]),
  objectPath: z.string().min(1).max(400).regex(/^[a-z0-9/_.-]+$/, "Path objek tidak valid.").refine((value) => !value.split("/").includes(".."), "Path objek tidak valid."),
  confirm: z.string(),
}).strict();

export async function deleteOrphanFile(actor: Actor, value: unknown) {
  requireRole(actor, "admin");
  const input = deleteInput.parse(value);
  if (input.confirm !== "HAPUS") throw new AuthHttpError(422, "CONFIRM_REQUIRED", 'Ketik "HAPUS" untuk mengonfirmasi penghapusan file.');
  // Hasil scan bisa sudah basi saat tombol diklik. Pemeriksaan ulang ini satu-satunya pagar sebelum rm:
  // begitu ada baris apa pun untuk (bucket, object_path) — termasuk berstatus deleted yang masih ditunggu
  // worker media.cleanup — file itu bukan milik kita dan penghapusan ditolak.
  // Sejak 0016 satu path bisa dimiliki banyak baris (revisi berbagi file), jadi semua baris dibaca, bukan satu.
  const owners = await getDatabase().select({ id: propertyMedia.id, status: propertyMedia.status }).from(propertyMedia)
    .where(and(eq(propertyMedia.bucket, input.bucket), eq(propertyMedia.objectPath, input.objectPath)));
  if (owners.length) {
    const statuses = [...new Set(owners.map((row) => row.status))].join(", ");
    throw new AuthHttpError(409, "MEDIA_NOT_ORPHAN", "File ini dipakai " + owners.length + " baris di database (status " + statuses + "), jadi tidak dihapus. Jalankan scan ulang.");
  }
  // Path yang sudah tidak ada ditolak: rm({force:true}) akan sukses tanpa protes, dan hasilnya baris audit
  // "terhapus" untuk file yang tidak pernah ada — laporan yang lebih buruk daripada error.
  const info = await statObject(input.bucket, input.objectPath);
  if (!info) throw new AuthHttpError(404, "MEDIA_FILE_NOT_FOUND", "File tidak ada di disk. Jalankan scan ulang.");
  // Audit ditulis sebelum file dihapus supaya jejaknya tidak hilang kalau rm gagal — urutan yang sama
  // dipakai deleteListings(): keputusan tercatat di DB dulu, filesystem menyusul.
  await getDatabase().insert(auditLogs).values({ actorId: actor.profileId, action: "media.orphan.purged", entityType: "property_media", entityId: null, metadata: { bucket: input.bucket, objectPath: input.objectPath, sizeBytes: info.sizeBytes } });
  await (input.bucket === "public" ? discardPublic(input.objectPath) : discard(input.objectPath));
  return { deleted: input.objectPath };
}
