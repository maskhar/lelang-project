import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import pg from "pg";

// Uji restore backup produksi ke instance PostgreSQL sementara yang terisolasi (port 25435,
// development memakai 25434) supaya database produksi tidak pernah disentuh. Arsip storage
// hanya diperiksa keterbacaannya; isinya tidak di-extract ke mana pun.
try {
  loadEnvFile(".env.docker.local");
} catch {
  throw new Error("Buat .env.docker.local dari .env.docker.example terlebih dahulu.");
}
const root = process.env.DOCKER_BACKUP_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error("DOCKER_BACKUP_ROOT wajib path absolut.");
const files = await readdir(root);
const dumps = files.filter((name) => name.startsWith("lelang-prod-") && name.endsWith(".dump")).sort();
if (!dumps.length) throw new Error("Backup produksi belum tersedia. Jalankan npm run docker:backup terlebih dahulu.");
const latestDump = dumps.at(-1);
const storageArchive = latestDump.slice(0, -".dump".length) + "-storage.tar.gz";
if (!files.includes(storageArchive)) throw new Error("Arsip storage pasangan backup ini tidak ditemukan: " + storageArchive);

const name = "lelang-prod-restore-test-" + Date.now();
const password = crypto.randomUUID().replaceAll("-", "");
const run = (args, options = {}) => { const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, ...options }); if (result.status !== 0) throw new Error("Restore test Docker operation failed."); return result; };
let started = false;
try {
  run(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1:25435:5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=lelang_prod_restore_test", "postgres:17.6-bookworm"], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  started = true;
  const url = "postgresql://postgres:" + password + "@127.0.0.1:25435/lelang_prod_restore_test";
  for (let attempt = 0; attempt < 60; attempt++) { const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 }); try { await client.connect(); await client.end(); break; } catch { await client.end().catch(() => undefined); if (attempt === 59) throw new Error("Restore database unavailable."); await new Promise((resolve) => setTimeout(resolve, 500)); } }
  const restore = spawnSync("docker", ["exec", "-i", name, "pg_restore", "-U", "postgres", "-d", "lelang_prod_restore_test", "--no-owner", "--no-privileges"], { input: await readFile(path.join(root, latestDump)), windowsHide: true, maxBuffer: 200 * 1024 * 1024 });
  if (restore.status !== 0) throw new Error("pg_restore failed.");
  const client = new pg.Client({ connectionString: url }); await client.connect();
  const result = await client.query("select to_regclass('app.properties') properties,to_regclass('app.user_sessions') sessions,to_regclass('app.outbox_events') outbox"); await client.end();
  if (!result.rows[0].properties || !result.rows[0].sessions || !result.rows[0].outbox) throw new Error("Restore verification failed.");
  const listing = spawnSync("tar", ["-tzf", path.join(root, storageArchive)], { encoding: "utf8", windowsHide: true, maxBuffer: 200 * 1024 * 1024 });
  if (listing.status !== 0 || !listing.stdout.trim()) throw new Error("Arsip storage tidak terbaca atau kosong.");
  console.log("PASS: dump produksi restored ke PostgreSQL terisolasi, tabel inti terverifikasi, arsip storage terbaca.");
} finally { if (started) run(["stop", name]); }
