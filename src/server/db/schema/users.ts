import { sql } from "drizzle-orm";
import { check, index, primaryKey, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { userRole, userStatus } from "./enums";
import { appSchema } from "./namespace";

export const profiles = appSchema.table("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  avatarUrl: varchar("avatar_url", { length: 2048 }),
  phone: varchar("phone", { length: 30 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: userStatus("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("profiles_email_canonical", sql`${table.email} = lower(${table.email})`),
  uniqueIndex("profiles_email_uidx").on(sql`lower(${table.email})`),
  index("profiles_status_idx").on(table.status),
]);

export const userRoles = appSchema.table("user_roles", {
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.role] })]);

export const userSessions = appSchema.table("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  ipHash: varchar("ip_hash", { length: 64 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  userAgentHash: varchar("user_agent_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("user_sessions_token_hash_uidx").on(table.tokenHash),
  index("user_sessions_user_expiry_idx").on(table.userId, table.expiresAt),
]);

export const userIdentities = appSchema.table("user_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 32 }).notNull().default("google"),
  providerSubject: varchar("provider_subject", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("user_identities_google_only", sql`${table.provider} = 'google'`),
  uniqueIndex("user_identities_subject_uidx").on(table.provider, table.providerSubject),
  uniqueIndex("user_identities_user_provider_uidx").on(table.userId, table.provider),
]);

export const oauthTransactions = appSchema.table("oauth_transactions", {
  stateHash: varchar("state_hash", { length: 64 }).primaryKey(),
  browserHash: varchar("browser_hash", { length: 64 }).notNull(),
  nonceHash: varchar("nonce_hash", { length: 64 }).notNull(),
  verifierHash: varchar("verifier_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("oauth_transactions_expiry_idx").on(table.expiresAt)]);
export const accessRequests = appSchema.table("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  requestedRole: userRole("requested_role").notNull(),
  reason: varchar("reason", { length: 1000 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: varchar("review_note", { length: 1000 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("access_requests_profile_idx").on(table.profileId, table.status), index("access_requests_status_idx").on(table.status, table.createdAt)]);
