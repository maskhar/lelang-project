import { boolean, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { appSchema } from "./namespace";
import { profiles } from "./users";

// Endpoint webhook keluar, satu baris per nama event (sekarang hanya 'lead_notification').
// secret_ciphertext menyimpan secret HMAC terenkripsi AES-256-GCM (kunci: WEBHOOK_SECRET_ENC_KEY),
// bukan plaintext, agar dump database yang bocor tidak langsung bisa memalsukan request ke n8n.
// Null berarti secret belum pernah dibuat, sehingga webhook belum bisa dikirim.
export const webhookEndpoints = appSchema.table("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull(),
  url: text("url").notNull(),
  secretCiphertext: text("secret_ciphertext"),
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => profiles.id),
}, (table) => [uniqueIndex("webhook_endpoints_name_uidx").on(table.name)]);
