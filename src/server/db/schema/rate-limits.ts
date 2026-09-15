import { check, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { appSchema } from "./namespace";

export const authRateLimits = appSchema.table("auth_rate_limits", {
  keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [check("auth_rate_limits_positive", sql`${table.attempts} > 0`)]);
