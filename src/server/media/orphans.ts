// Klasifikasi orphan media: fungsi murni tanpa disk/DB supaya bisa diuji unit tanpa Postgres.
// Kunci peta adalah (bucket, objectPath), dan satu kunci bisa punya BANYAK baris: sejak 0016 revisi berbagi file
// fisik yang sama, jadi peta menyimpan daftar baris, bukan satu baris.

export type MediaRowRef = { id: string; bucket: string; objectPath: string; status: "pending" | "ready" | "rejected" | "deleted" };
export type StoredFileRef = { bucket: "quarantine" | "public"; objectPath: string; sizeBytes: number; modifiedAt: string };

export type OrphanFile = StoredFileRef & { mediaId: string | null; status: MediaRowRef["status"] | null };
export type MissingFile = { mediaId: string; bucket: string; objectPath: string };
export type OrphanClass<T> = { count: number; bytes: number; sample: T[]; sampleTruncated: boolean };
export type OrphanReport = {
  // File di disk tanpa baris property_media apa pun: sisa rollback upload yang gagal atau discardPublic()
  // yang gagal di deleteListings() (dibungkus .catch). Tidak ada yang memilikinya — satu-satunya kelas yang boleh dihapus.
  tanpaBaris: OrphanClass<OrphanFile>;
  // Barisnya ada tapi status 'deleted': file masih ditunggu event media.cleanup. Baris deleted sengaja
  // dipertahankan supaya worker masih bisa menemukan path-nya, jadi kelas ini tidak boleh dihapus dari UI.
  menungguWorker: OrphanClass<OrphanFile>;
  // Bucket quarantine: upload yang mati sebelum promote/rollback, atau baris berstatus rejected. Belum ada penyapunya.
  sisaQuarantine: OrphanClass<OrphanFile>;
  // Kebalikannya: baris ready/pending tapi file tidak ada di disk. Inilah yang dicatat /api/v1/media/[id]
  // sebagai log media.object.missing. Tidak ada file untuk dihapus; properti terdampak perlu unggah ulang.
  fileHilang: OrphanClass<MissingFile>;
};

export const orphanSampleLimit = 200;
const key = (bucket: string, objectPath: string) => bucket + ":" + objectPath;

function emptyClass<T>(): OrphanClass<T> { return { count: 0, bytes: 0, sample: [], sampleTruncated: false }; }
function push<T>(target: OrphanClass<T>, item: T, bytes: number) {
  target.count += 1;
  target.bytes += bytes;
  if (target.sample.length < orphanSampleLimit) target.sample.push(item); else target.sampleTruncated = true;
}

export function classifyOrphans(rows: MediaRowRef[], files: StoredFileRef[]): OrphanReport {
  const report: OrphanReport = { tanpaBaris: emptyClass(), menungguWorker: emptyClass(), sisaQuarantine: emptyClass(), fileHilang: emptyClass() };
  const byPath = new Map<string, MediaRowRef[]>();
  for (const row of rows) {
    const id = key(row.bucket, row.objectPath);
    const list = byPath.get(id);
    if (list) list.push(row); else byPath.set(id, [row]);
  }
  const onDisk = new Set(files.map((file) => key(file.bucket, file.objectPath)));

  for (const file of files) {
    const owners = byPath.get(key(file.bucket, file.objectPath)) ?? [];
    // mediaId/status mewakili satu baris saja (yang pertama) — kolom informatif di UI, bukan dasar klasifikasi.
    const entry: OrphanFile = { ...file, mediaId: owners[0]?.id ?? null, status: owners[0]?.status ?? null };
    // Quarantine diperiksa lebih dulu: file di sana tidak pernah masuk kelas lain, apa pun status barisnya.
    if (file.bucket === "quarantine") push(report.sisaQuarantine, entry, file.sizeBytes);
    else if (!owners.length) push(report.tanpaBaris, entry, file.sizeBytes);
    // Hanya "menunggu worker" kalau SEMUA baris pada path itu deleted. Kalau ada satu saja yang masih hidup,
    // file itu justru sedang dipakai revisi lain dan bukan kandidat penghapusan.
    else if (owners.every((row) => row.status === "deleted")) push(report.menungguWorker, entry, file.sizeBytes);
  }

  for (const row of rows) {
    if (row.status === "deleted" || row.status === "rejected") continue;
    if (!onDisk.has(key(row.bucket, row.objectPath))) push(report.fileHilang, { mediaId: row.id, bucket: row.bucket, objectPath: row.objectPath }, 0);
  }

  return report;
}
