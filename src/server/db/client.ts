import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getServerEnvironment } from "@/server/env";
import * as schema from "./schema";

let pool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    const { DATABASE_URL } = getServerEnvironment();
    if (!DATABASE_URL) throw new Error("DATABASE_URL belum dikonfigurasi.");

    pool = new Pool({ connectionString: DATABASE_URL, max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000, statement_timeout: 5_000, query_timeout: 6_000 });
    pool.on("error", () => console.error("Database idle connection failed."));
  }

  return pool;
}

export function getDatabase() {
  return drizzle(getDatabasePool(), { schema });
}
