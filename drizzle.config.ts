import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env.migration.local")) loadEnvFile(".env.migration.local");

const databaseUrl = process.env.DATABASE_MIGRATION_URL;

if (!databaseUrl) throw new Error("DATABASE_MIGRATION_URL wajib diisi untuk menjalankan Drizzle Kit.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl },
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});
