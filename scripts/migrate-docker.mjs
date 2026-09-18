import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { loadEnvFile } from "node:process";

// Menjalankan drizzle-kit migrate terhadap PostgreSQL Docker produksi. URL dibangun dari
// .env.docker.local lalu diberikan lewat environment child process; drizzle.config.ts tetap
// memanggil loadEnvFile(".env.migration.local"), tetapi loadEnvFile tidak menimpa variabel yang
// sudah ada sehingga URL produksi di sini yang dipakai. Host dipaksa loopback (AGENTS.md).
try {
  loadEnvFile(".env.docker.local");
} catch {
  throw new Error("Buat .env.docker.local dari .env.docker.example terlebih dahulu.");
}
const port = process.env.POSTGRES_PORT || "15433";
const password = process.env.POSTGRES_MIGRATOR_PASSWORD;
if (!/^\d+$/.test(port) || !password) throw new Error("POSTGRES_PORT dan POSTGRES_MIGRATOR_PASSWORD wajib terisi pada .env.docker.local.");
const target = new URL("postgresql://127.0.0.1");
target.username = "lelang_migrator";
target.password = password;
target.port = port;
target.pathname = "/" + (process.env.POSTGRES_DB || "lelang_properti_prod");

// drizzle-kit 0.31 tidak mengekspos "./package.json" di field "exports", jadi require.resolve
// subpath itu gagal (ERR_PACKAGE_PATH_NOT_EXPORTED). Entry utama "." tetap diekspos dan berada
// di root paket yang sama dengan bin.cjs, jadi dipakai untuk menemukan root paket.
const require = createRequire(import.meta.url);
const binPath = path.join(path.dirname(require.resolve("drizzle-kit")), "bin.cjs");
const result = spawnSync(process.execPath, [binPath, "migrate"], { stdio: "inherit", env: { ...process.env, DATABASE_MIGRATION_URL: target.toString() } });
process.exitCode = result.status ?? 1;
