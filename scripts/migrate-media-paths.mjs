// One-off: pindahkan foto lama dari public/YYYY/MM/DD/<uuid>.<ext> ke public/<sku>/<NN>-<uuid>.webp
// dan perbarui app.property_media.object_path. Hanya baris bucket='public' status='ready' yang dipindah;
// baris 'deleted' dibiarkan agar worker media.cleanup tetap menemukan filenya di path lama.
// File disalin dulu (bukan rename); path lama baru dihapus setelah semua update DB commit.
import { cp, mkdir, rm, access } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import pg from "pg";

try { loadEnvFile(".env.local"); } catch { }
try { loadEnvFile(".env.migration.local"); } catch { }
const target = new URL(process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL || "");
if (target.hostname !== "127.0.0.1" || !["/lelang_properti_dev"].includes(target.pathname)) throw new Error("Migrasi hanya menerima database development lokal.");
const storageRoot = process.env.STORAGE_ROOT;
if (!storageRoot || !path.isAbsolute(storageRoot)) throw new Error("STORAGE_ROOT wajib path absolut.");
const backupRoot = process.env.BACKUP_ROOT;
if (!backupRoot || !path.isAbsolute(backupRoot)) throw new Error("BACKUP_ROOT wajib path absolut di luar repository.");

const publicRoot = path.join(storageRoot, "public");
const backupDir = path.join(backupRoot, "media-path-migration-" + new Date().toISOString().replaceAll(":", "-"));
await mkdir(backupDir, { recursive: true });
await cp(publicRoot, backupDir, { recursive: true });
console.log("Backup file:", backupDir);

const folderFor = (sku) => sku.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const client = new pg.Client({ connectionString: target.toString() });
await client.connect();
try {
  await client.query("begin");
  const { rows } = await client.query(`
    select m.id, m.object_path, m.sort_order, p.sku, p.id as property_id, r.revision_number
    from app.property_media m
    join app.property_revisions r on r.id = m.revision_id
    join app.properties p on p.id = r.property_id
    where m.bucket = 'public' and m.status = 'ready'
    order by p.id, r.revision_number asc, m.sort_order asc, m.id asc
    for update of m`);
  const moves = [];
  const counters = new Map();
  for (const row of rows) {
    if (/^[a-z0-9-]+\/\d{2}-[0-9a-f-]{36}\.webp$/.test(row.object_path)) { console.log("lewati (sudah format baru):", row.object_path); continue; }
    const source = path.join(publicRoot, row.object_path);
    try { await access(source); } catch { console.warn("LEWATI: file tidak ada di disk:", row.object_path, "(id " + row.id + ")"); continue; }
    const seq = (counters.get(row.property_id) || 0) + 1;
    counters.set(row.property_id, seq);
    const uuid = path.parse(row.object_path).name;
    const objectPath = `${folderFor(row.sku)}/${String(seq).padStart(2, "0")}-${uuid}.webp`;
    const destination = path.join(publicRoot, objectPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { errorOnExist: true, force: false });
    await client.query("update app.property_media set object_path=$2, updated_at=now() where id=$1", [row.id, objectPath]);
    moves.push({ source, from: row.object_path, to: objectPath });
  }
  await client.query("commit");
  for (const move of moves) { await rm(move.source, { force: true }); console.log(move.from, "->", move.to); }
  console.log("Selesai:", moves.length, "file dipindah. Folder tanggal kosong bisa dihapus manual. Backup:", backupDir);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  console.error("Migrasi gagal, DB di-rollback, file asli tidak dihapus:", error);
  process.exitCode = 1;
} finally { await client.end(); }
