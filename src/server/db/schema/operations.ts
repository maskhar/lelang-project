import { index, integer, jsonb, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { leadStatus, outboxStatus } from "./enums";
import { appSchema } from "./namespace";
import { properties } from "./properties";
import { profiles } from "./users";

export const leads = appSchema.table("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  message: text("message"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  status: leadStatus("status").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("leads_property_status_idx").on(table.propertyId, table.status, table.createdAt)]);

export const auditLogs = appSchema.table("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: uuid("entity_id"),
  requestId: varchar("request_id", { length: 100 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);

export const outboxEvents = appSchema.table("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 120 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: outboxStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("outbox_events_claim_idx").on(table.status, table.availableAt, table.createdAt)]);
