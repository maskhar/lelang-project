import { index, integer, jsonb, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { leadStatus, outboxStatus } from "./enums";
import { appSchema } from "./namespace";
import { properties } from "./properties";
import { profiles } from "./users";

export const leads = appSchema.table("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  buyerId: uuid("buyer_id").references(() => profiles.id),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  message: text("message"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  status: leadStatus("status").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("leads_property_status_idx").on(table.propertyId, table.status, table.createdAt), index("leads_buyer_idx").on(table.buyerId, table.createdAt)]);

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

export const propertyWatchlists = appSchema.table("property_watchlists", {
  buyerId: uuid("buyer_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.buyerId, table.propertyId] }), index("property_watchlists_buyer_idx").on(table.buyerId, table.createdAt)]);

export const propertyAssignments = appSchema.table("property_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").notNull().references(() => profiles.id),
  assignedBy: uuid("assigned_by").notNull().references(() => profiles.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
  note: varchar("note", { length: 1000 }),
}, (table) => [index("property_assignments_agent_idx").on(table.agentId, table.unassignedAt), index("property_assignments_property_idx").on(table.propertyId, table.unassignedAt)]);
