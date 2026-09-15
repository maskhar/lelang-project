import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import path from "node:path";
import pg from "pg";

try { loadEnvFile(".env.local"); } catch { }
const root = process.env.BACKUP_ROOT;
if (!root || !path.isAbsolute(root)) throw new Error("BACKUP_ROOT wajib path absolut.");
const backups = (await readdir(root)).filter((name) => name.endsWith(".dump")).sort();
if (!backups.length) throw new Error("Backup belum tersedia.");
const name = "lelang-restore-test-" + Date.now();
const password = crypto.randomUUID().replaceAll("-", "");
const run = (args, options = {}) => { const result = spawnSync("docker", args, { encoding: "utf8", windowsHide: true, ...options }); if (result.status !== 0) throw new Error("Restore test Docker operation failed."); return result; };
let started = false;
try {
  run(["run", "--rm", "-d", "--name", name, "-p", "127.0.0.1:25434:5432", "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB=lelang_restore_test", "postgres:17.6-bookworm"], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  started = true;
  const url = "postgresql://postgres:" + password + "@127.0.0.1:25434/lelang_restore_test";
  for (let attempt = 0; attempt < 60; attempt++) { const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 1000 }); try { await client.connect(); await client.end(); break; } catch { await client.end().catch(() => undefined); if (attempt === 59) throw new Error("Restore database unavailable."); await new Promise((resolve) => setTimeout(resolve, 500)); } }
  const dump = path.join(root, backups.at(-1));
  const restore = spawnSync("docker", ["exec", "-i", name, "pg_restore", "-U", "postgres", "-d", "lelang_restore_test", "--no-owner", "--no-privileges"], { input: await import("node:fs/promises").then((module) => module.readFile(dump)), windowsHide: true, maxBuffer: 100 * 1024 * 1024 });
  if (restore.status !== 0) throw new Error("pg_restore failed.");
  const client = new pg.Client({ connectionString: url }); await client.connect();
  const result = await client.query("select to_regclass('app.properties') properties,to_regclass('app.user_sessions') sessions,to_regclass('app.outbox_events') outbox"); await client.end();
  if (!result.rows[0].properties || !result.rows[0].sessions || !result.rows[0].outbox) throw new Error("Restore verification failed.");
  console.log("PASS: backup restored into isolated PostgreSQL and core tables verified.");
} finally { if (started) run(["stop", name]); }
