import { readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import pg from "pg";

// Padanan grant-runtime.mjs untuk stack Docker produksi (docker-compose.yml). Port dan nama
// database dibaca dari .env.docker.local, tetapi host tetap dipaksa loopback — database produksi
// tidak boleh diekspos publik (AGENTS.md). SQL yang dijalankan sama persis dengan development.
try {
  loadEnvFile(".env.docker.local");
} catch {
  throw new Error("Buat .env.docker.local dari .env.docker.example terlebih dahulu.");
}
const port = process.env.POSTGRES_PORT || "15433";
const database = process.env.POSTGRES_DB || "lelang_properti_prod";
const password = process.env.POSTGRES_MIGRATOR_PASSWORD;
if (!/^\d+$/.test(port) || !password) throw new Error("POSTGRES_PORT dan POSTGRES_MIGRATOR_PASSWORD wajib terisi pada .env.docker.local.");
const target = new URL("postgresql://127.0.0.1");
target.username = "lelang_migrator";
target.password = password;
target.port = port;
target.pathname = "/" + database;
const client = new pg.Client({ connectionString: target.toString() });
try {
  await client.connect();
  await client.query(readFileSync("scripts/grant-runtime.sql", "utf8"));
  console.log("Grants runtime produksi diterapkan; privilege schema dan mutasi audit dibatasi.");
} finally {
  await client.end();
}
