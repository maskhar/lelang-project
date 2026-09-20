import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, smallint, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { availabilityStatus, mediaStatus, publicationStatus, reviewStatus, saleMode } from "./enums";
import { appSchema } from "./namespace";
import { profiles } from "./users";

export const properties = appSchema.table("properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 160 }).notNull(),
  sku: varchar("sku", { length: 40 }).notNull().default(sql`'LP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))`),
  createdBy: uuid("created_by").notNull().references(() => profiles.id),
  ownerId: uuid("owner_id").references(() => profiles.id),
  saleMode: saleMode("sale_mode").notNull(),
  publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
  availabilityStatus: availabilityStatus("availability_status").notNull().default("available"),
  type: varchar("type", { length: 40 }).notNull(),
  provinceCode: varchar("province_code", { length: 10 }).notNull(),
  cityCode: varchar("city_code", { length: 20 }).notNull(),
  askingPrice: bigint("asking_price", { mode: "number" }).notNull(),
  publishedRevisionId: uuid("published_revision_id"),
  version: integer("version").notNull().default(1),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("properties_price_safe", sql`${table.askingPrice} between 1 and 9007199254740991`),
  check("properties_version_positive", sql`${table.version} > 0`),
  uniqueIndex("properties_slug_uidx").on(table.slug),
  uniqueIndex("properties_sku_uidx").on(table.sku),
  index("properties_catalog_idx").on(table.publicationStatus, table.availabilityStatus, table.publishedAt, table.id),
  index("properties_location_idx").on(table.provinceCode, table.cityCode),
  index("properties_price_idx").on(table.askingPrice),
]);

export const propertyRevisions = appSchema.table("property_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  revisionNumber: integer("revision_number").notNull(),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description").notNull(),
  address: text("address"),
  listingSnapshot: jsonb("listing_snapshot").$type<{ city: string; province: string; address?: string; latitude?: number | null; longitude?: number | null; saleMode: "auction" | "direct_sale"; type: string; askingPrice: number }>(),
  amenities: jsonb("amenities").$type<string[]>().notNull().default([]),
  landAreaM2: integer("land_area_m2").notNull().default(0),
  buildingAreaM2: integer("building_area_m2").notNull().default(0),
  bedroomCount: smallint("bedroom_count").notNull().default(0),
  auctionStartsAt: timestamp("auction_starts_at", { withTimezone: true }),
  auctionEndsAt: timestamp("auction_ends_at", { withTimezone: true }),
  status: reviewStatus("status").notNull().default("draft"),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id),
  reviewReason: text("review_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("revision_valid_numbers", sql`${table.revisionNumber} > 0 and ${table.landAreaM2} >= 0 and ${table.buildingAreaM2} >= 0 and ${table.bedroomCount} >= 0`),
  check("revision_valid_schedule", sql`(${table.auctionStartsAt} is null and ${table.auctionEndsAt} is null) or (${table.auctionStartsAt} is not null and ${table.auctionEndsAt} is not null and ${table.auctionEndsAt} > ${table.auctionStartsAt})`),
  uniqueIndex("property_revisions_number_uidx").on(table.propertyId, table.revisionNumber),
  index("property_revisions_review_idx").on(table.status, table.createdAt),
]);

export const propertyMedia = appSchema.table("property_media", {
  id: uuid("id").primaryKey().defaultRandom(),
  revisionId: uuid("revision_id").notNull().references(() => propertyRevisions.id, { onDelete: "cascade" }),
  bucket: varchar("bucket", { length: 100 }).notNull(),
  objectPath: text("object_path").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: varchar("checksum_sha256", { length: 64 }),
  sortOrder: smallint("sort_order").notNull().default(0),
  isCover: boolean("is_cover").notNull().default(false),
  status: mediaStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("media_size_and_order", sql`${table.sizeBytes} between 1 and 5242880 and ${table.sortOrder} >= 0`),
  uniqueIndex("property_media_cover_uidx").on(table.revisionId).where(sql`${table.isCover} = true and ${table.status} <> 'deleted'`),
  uniqueIndex("property_media_object_uidx").on(table.bucket, table.objectPath),
  index("property_media_revision_idx").on(table.revisionId, table.status, table.sortOrder),
]);


