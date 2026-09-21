// One-off: satukan file foto yang isinya identik di dalam satu properti jadi satu file fisik, lalu hapus
// salinannya. Sebelum 0016, editListing() menggandakan seluruh foto tiap kali properti diedit (object_path unik
// per baris): development memakan 1663 file / 510 MB untuk 534 isi gambar berbeda, produksi 2670 file / 602 MB
// untuk 606 isi berbeda. Kodenya sudah berhenti menggandakan; skrip ini membereskan sisanya.
//
// Dipakai dua kali di dua mode (--prod), bukan sekali: masing-masing database punya sisa duplikatnya sendiri.
//
// Dedup PER PROPERTI, bukan global: path tetap <sku>/NN-uuid.webp sehingga folder SKU tetap terbaca dan hapus
// properti tetap operasi terisolasi — tidak ada file satu properti yang tersangkut di properti lain. Grup
// checksum yang kebetulan sama lintas properti dibiarkan terduplikasi.
//
// Baris status='deleted' TIDAK DISENTUH: sebagian checksum-nya beririsan dengan baris live, dan barisnya masih
// dipakai worker media.cleanup untuk menemukan path filenya.
//
// Urutan: update DB dulu, file lama di-rm setelah commit. Kalau rm gagal, yang tertinggal adalah file tak
// terpakai (terdeteksi scan orphan, bisa dihapus dari UI), bukan baris DB yang menunjuk file hilang.
//
// Jalankan (development):  node scripts/consolidate-media-duplicates.mjs --dry-run
//                          node scripts/consolidate-media-duplicates.mjs
// Jalankan (produksi):     node scripts/consolidate-media-duplicates.mjs --prod --dry-run
//                          node scripts/consolidate-media-duplicates.mjs --prod
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import pg from "pg";

const dryRun = process.argv.includes("--dry-run");
// --prod wajib disebut terang-terangan. Tanpa flag ini skrip hanya menerima database development,
// supaya tidak ada jalan menyentuh produksi karena salah menyetel environment.
const prod = process.argv.includes("--prod");

let target;
let storageRoot;
let backupRootDefault;
if (prod) {
  // Kredensial dan path produksi dibaca dari .env.docker.local, pola sama seperti migrate-docker.mjs:
  // URL dibangun sendiri (role migrator, host dipaksa loopback) bukan diambil dari DATABASE_URL.
  try { loadEnvFile(".env.docker.local"); } catch { throw new Error("Buat .env.docker.local terlebih dahulu."); }
  const port = process.env.POSTGRES_PORT || "15433";
  const password = process.env.POSTGRES_MIGRATOR_PASSWORD;
  if (!/^\d+$/.test(port) || !password) throw new Error("POSTGRES_PORT dan POSTGRES_MIGRATOR_PASSWORD wajib terisi pada .env.docker.local.");
  target = new URL("postgresql://127.0.0.1");
  target.username = "lelang_migrator";
  target.password = password;
  target.port = port;
  target.pathname = "/" + (process.env.POSTGRES_DB || "lelang_properti_prod");
  // Storage produksi dibaca dari path host yang di-mount ke /data/storage container, bukan STORAGE_ROOT dev.
  storageRoot = process.env.STORAGE_HOST_PATH;
  backupRootDefault = process.env.DOCKER_BACKUP_ROOT;
} else {
  try { loadEnvFile(".env.local"); } catch { }
  try { loadEnvFile(".env.migration.local"); } catch { }
  target = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || "");
  storageRoot = process.env.STORAGE_ROOT;
  backupRootDefault = process.env.BACKUP_ROOT;
}
// Loopback tetap wajib di kedua mode; nama database dibatasi sesuai mode supaya --prod tidak bisa
// mengenai dev dan sebaliknya.
const allowed = prod ? ["/lelang_properti_prod"] : ["/lelang_properti_dev"];
if (target.hostname !== "127.0.0.1" || !allowed.includes(target.pathname)) throw new Error("Database di luar cakupan mode ini: " + target.pathname + " (mode " + (prod ? "produksi" : "development") + ").");
if (!storageRoot || !path.isAbsolute(storageRoot)) throw new Error((prod ? "STORAGE_HOST_PATH" : "STORAGE_ROOT") + " wajib path absolut.");
const publicRoot = path.join(storageRoot, "public");

// Produksi: aplikasi harus berhenti selama skrip jalan. Rencana dibaca sekali di awal, jadi properti yang
// DIEDIT di tengah proses bisa menghasilkan baris yang menunjuk path yang beberapa detik kemudian di-rm.
// Upload murni aman, tapi editnya tidak — jadi pintunya ditutup, bukan diperingatkan.
if (prod && !dryRun) {
  const running = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", "project-lelangan-properti-app"], { encoding: "utf8", windowsHide: true });
  if (running.stdout?.trim() === "true") throw new Error("Hentikan container app dahulu: docker compose --env-file .env.docker.local stop app");
}

const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1) + " MB";

const client = new pg.Client({ connectionString: target.toString() });
await client.connect();
try {
  // Baris live saja, diurutkan supaya wakil terpilih deterministik: revisi terbit lebih dulu, lalu revisi
  // tertinggi. Path yang bertahan jadi path yang dipakai halaman publik.
  const { rows } = await client.query(`
    select m.id, m.bucket, m.object_path, m.size_bytes, m.content_type, m.checksum_sha256,
           p.id as property_id, p.sku, r.revision_number,
           (p.published_revision_id is not distinct from r.id) as published
    from app.property_media m
    join app.property_revisions r on r.id = m.revision_id
    join app.properties p on p.id = r.property_id
    where m.status <> 'deleted' and m.bucket = 'public' and m.checksum_sha256 is not null
    order by p.id, m.checksum_sha256, published desc, r.revision_number desc, m.id asc`);

  // Kelompokkan per (properti, checksum). Kunci sengaja menyertakan property_id supaya dedup tidak lintas properti.
  const groups = new Map();
  for (const row of rows) {
    const key = row.property_id + ":" + row.checksum_sha256;
    const list = groups.get(key);
    if (list) list.push(row); else groups.set(key, [row]);
  }

  const plan = [];
  let skipped = 0;
  for (const [key, members] of groups) {
    const distinctPaths = new Set(members.map((row) => row.object_path));
    if (distinctPaths.size < 2) continue;
    // Checksum sama tapi metadata beda berarti asumsi "checksum = identitas isi" tidak berlaku di grup ini.
    // 0 grup seperti ini di dev hari ini, tapi jangan berasumsi.
    const [first] = members;
    if (members.some((row) => Number(row.size_bytes) !== Number(first.size_bytes) || row.content_type !== first.content_type)) {
      console.warn("LEWATI grup", key, "— size_bytes/content_type tidak konsisten.");
      skipped++;
      continue;
    }
    const representative = first; // urutan query: published desc, revision_number desc
    // Pagar terakhir sebelum menghapus data: isi file wakil dihitung ulang dari disk dan dibandingkan dengan
    // checksum yang tercatat. Tidak cocok (atau file tidak terbaca) → seluruh grup dilewati.
    const source = path.join(publicRoot, representative.object_path);
    let bytes;
    try { bytes = await readFile(source); } catch { console.warn("LEWATI grup", key, "— file wakil tidak terbaca:", representative.object_path); skipped++; continue; }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== representative.checksum_sha256) {
      console.warn("LEWATI grup", key, "— sha256 file wakil tidak cocok dengan checksum_sha256:", representative.object_path);
      skipped++;
      continue;
    }
    const followers = members.filter((row) => row.object_path !== representative.object_path);
    const releasedPaths = [...new Set(followers.map((row) => row.object_path))];
    plan.push({ sku: representative.sku, keep: representative.object_path, followerIds: followers.map((row) => row.id), releasedPaths, bytesPerFile: Number(first.size_bytes) });
  }

  const rowsTouched = plan.reduce((total, item) => total + item.followerIds.length, 0);
  const filesReleased = plan.reduce((total, item) => total + item.releasedPaths.length, 0);
  const bytesReleased = plan.reduce((total, item) => total + item.releasedPaths.length * item.bytesPerFile, 0);
  const pathsBefore = new Set(rows.map((row) => row.object_path)).size;
  console.log("Grup duplikat:", plan.length, "| grup dilewati:", skipped);
  console.log("Baris diarahkan ulang:", rowsTouched);
  console.log("File:", pathsBefore, "->", pathsBefore - filesReleased, "(" + filesReleased + " dihapus, " + megabytes(bytesReleased) + " dibebaskan)");

  if (!plan.length) { console.log("Tidak ada yang dikonsolidasi."); process.exit(0); }
  if (dryRun) {
    for (const item of plan.slice(0, 20)) console.log("  " + item.sku, "simpan", item.keep, "hapus", item.releasedPaths.length, "file");
    if (plan.length > 20) console.log("  ... dan", plan.length - 20, "grup lain");
    console.log("DRY RUN: tidak ada perubahan ditulis.");
    process.exit(0);
  }

  // Backup seluruh public/ sebelum menyentuh apa pun. Wajib di luar repository: BACKUP_ROOT untuk dev,
  // DOCKER_BACKUP_ROOT untuk produksi. Ini salinan kedua di samping npm run docker:backup — murah
  // dibanding kehilangan foto, dan yang ini khusus berisi keadaan persis sebelum skrip menyentuh apa pun.
  const backupRoot = backupRootDefault;
  if (!backupRoot || !path.isAbsolute(backupRoot)) throw new Error((prod ? "DOCKER_BACKUP_ROOT" : "BACKUP_ROOT") + " wajib path absolut di luar repository.");
  const backupDir = path.join(backupRoot, "media-dedup-" + new Date().toISOString().replaceAll(":", "-"));
  await mkdir(backupDir, { recursive: true });
  await cp(publicRoot, backupDir, { recursive: true });
  console.log("Backup file:", backupDir);

  await client.query("begin");
  for (const item of plan) {
    await client.query("update app.property_media set object_path=$2, updated_at=now() where id = any($1::uuid[])", [item.followerIds, item.keep]);
  }
  await client.query("commit");
  console.log("DB commit:", rowsTouched, "baris diarahkan ke path wakil.");

  // Setelah commit: hapus hanya path yang benar-benar sudah tidak dirujuk baris mana pun (termasuk baris
  // 'deleted' yang tidak kita sentuh) — dibaca ulang dari DB, bukan diasumsikan dari rencana.
  const candidates = [...new Set(plan.flatMap((item) => item.releasedPaths))];
  const { rows: stillUsed } = await client.query("select distinct object_path from app.property_media where object_path = any($1::text[])", [candidates]);
  const used = new Set(stillUsed.map((row) => row.object_path));
  let removed = 0;
  for (const objectPath of candidates) {
    if (used.has(objectPath)) { console.warn("DIPERTAHANKAN (masih dirujuk baris lain):", objectPath); continue; }
    await rm(path.join(publicRoot, objectPath), { force: true });
    removed++;
  }
  console.log("Selesai:", removed, "file dihapus,", megabytes(bytesReleased), "dibebaskan. Backup:", backupDir);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Konsolidasi gagal, DB di-rollback, tidak ada file yang dihapus:", error);
  process.exitCode = 1;
} finally { await client.end(); }
