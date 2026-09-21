import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { pipeline } from "node:stream/promises";

// Backup stack Docker produksi: pg_dump lewat socket lokal di dalam container postgres (trust
// auth bawaan image Postgres resmi, pola sama seperti backup-local.mjs — tidak butuh password)
// plus arsip penuh STORAGE_HOST_PATH. DOCKER_BACKUP_ROOT wajib path absolut di luar repository.
try {
  loadEnvFile(".env.docker.local");
} catch {
  throw new Error("Buat .env.docker.local dari .env.docker.example terlebih dahulu.");
}
const database = process.env.POSTGRES_DB || "lelang_properti_prod";
const storageRoot = process.env.STORAGE_HOST_PATH;
if (!storageRoot || !path.isAbsolute(storageRoot)) throw new Error("STORAGE_HOST_PATH wajib path absolut pada .env.docker.local.");
const directory = process.env.DOCKER_BACKUP_ROOT;
if (!directory || !path.isAbsolute(directory)) throw new Error("DOCKER_BACKUP_ROOT wajib path absolut privat di luar repository.");
const relative = path.relative(process.cwd(), directory);
if (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw new Error("Backup tidak boleh di dalam repository.");
await mkdir(directory, { recursive: true });

const stamp = new Date().toISOString().replaceAll(":", "-");
const dumpFile = path.join(directory, "lelang-prod-" + stamp + ".dump");
const storageArchive = path.join(directory, "lelang-prod-" + stamp + "-storage.tar.gz");

async function dumpDatabase() {
  const child = spawn("docker", ["compose", "--env-file", ".env.docker.local", "exec", "-T", "postgres", "pg_dump", "-U", "postgres", "-d", database, "-Fc"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stderr.resume();
  const finished = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error("pg_dump failed."))); });
  await Promise.all([pipeline(child.stdout, createWriteStream(dumpFile, { flags: "wx", mode: 0o600 })), finished]);
}

async function archiveStorage() {
  // Arsip penuh setiap kali dijalankan (bukan incremental) — sederhana dan cukup untuk volume
  // dokumen/foto properti saat ini. Jadwalkan lewat Task Scheduler Windows di host operator.
  //
  // --force-local wajib di Windows: tanpa itu GNU tar membaca "I:/..." sebagai host:path remote dan
  // gagal dengan "Cannot connect to I: resolve failed" — backup produksi diam-diam tidak pernah jadi.
  const result = spawnSync("tar", ["--force-local", "-czf", storageArchive, "-C", path.dirname(storageRoot), path.basename(storageRoot)], { windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
  if (result.status !== 0) throw new Error("Arsip storage gagal; pesan tar di atas.");
  await chmod(storageArchive, 0o600);
}

try {
  await dumpDatabase();
  await archiveStorage();
  console.log("Backup produksi selesai: " + dumpFile + " dan " + storageArchive + ". Uji restore terpisah tetap wajib.");
} catch (error) {
  await rm(dumpFile, { force: true });
  await rm(storageArchive, { force: true });
  console.error("Backup gagal; artefak parsial dihapus.", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
