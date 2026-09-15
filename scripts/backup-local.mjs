import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import { pipeline } from "node:stream/promises";

try { loadEnvFile(".env.local"); } catch { }
loadEnvFile(".env.migration.local");
const target = new URL(process.env.DATABASE_MIGRATION_URL);
if (target.hostname !== "127.0.0.1" || target.port !== "15432" || target.pathname !== "/lelang_properti_dev") throw new Error("Backup hanya menerima database development lokal.");
const directory = process.env.BACKUP_ROOT;
if (!directory || !path.isAbsolute(directory)) throw new Error("BACKUP_ROOT wajib path absolut privat di luar repository.");
const relative = path.relative(process.cwd(), directory);
if (!relative || (!relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) throw new Error("Backup tidak boleh di dalam repository.");
await mkdir(directory, { recursive: true });
const filename = path.join(directory, "lelang-" + new Date().toISOString().replaceAll(":", "-") + ".dump");
const child = spawn("docker", ["compose", "--env-file", ".env.backend.local", "-f", "compose.backend.yml", "exec", "-T", "postgres", "pg_dump", "-U", "postgres", "-d", "lelang_properti_dev", "-Fc"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
child.stderr.resume();
const finished = new Promise((resolve, reject) => { child.once("error", reject); child.once("close", (code) => code === 0 ? resolve() : reject(new Error("pg_dump failed."))); });
try { await Promise.all([pipeline(child.stdout, createWriteStream(filename, { flags: "wx", mode: 0o600 })), finished]); console.log("Backup lokal selesai. Uji restore terpisah tetap wajib."); }
catch { child.kill(); await rm(filename, { force: true }); console.error("Backup gagal; file parsial dihapus."); process.exitCode = 1; }
