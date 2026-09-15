import "server-only";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, gte, ilike, isNotNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { properties, propertyRevisions } from "@/server/db/schema";
import { AuthHttpError } from "@/server/auth/http";
import { propertyTypes } from "@/lib/properties";

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.string().refine((value) => propertyTypes.includes(value)).optional(),
  city: z.string().trim().max(100).optional(),
  province: z.string().trim().max(100).optional(),
  saleMode: z.enum(["auction", "direct_sale"]).optional(),
  availabilityStatus: z.enum(["available", "sold"]).optional(),
  minPrice: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  maxPrice: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(["newest", "price_asc", "price_desc", "deadline"]).default("newest"),
  cursor: z.string().max(1500).optional(),
}).strict().refine((value) => !value.minPrice || !value.maxPrice || value.minPrice <= value.maxPrice);
const cursorSchema = z.object({ id: z.uuid(), value: z.union([z.iso.datetime({ offset: true }), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]), fingerprint: z.string().length(64) }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function catalog(parameters: URLSearchParams) {
  for (const key of parameters.keys()) if (parameters.getAll(key).length > 1) throw new AuthHttpError(422, "INVALID_QUERY", "Parameter duplikat tidak diizinkan.");
  const parsed = filtersSchema.parse(Object.fromEntries(parameters));
  const { cursor, ...filters } = parsed;
  const fingerprint = hash(JSON.stringify(filters));
  const predicates = [eq(properties.publicationStatus, "published")];
  if (filters.type) predicates.push(eq(properties.type, filters.type));
  if (filters.city) predicates.push(eq(properties.cityCode, hash(filters.city.toLocaleLowerCase("id-ID")).slice(0, 10)));
  if (filters.province) predicates.push(eq(properties.provinceCode, hash(filters.province.toLocaleLowerCase("id-ID")).slice(0, 10)));
  if (filters.saleMode) predicates.push(eq(properties.saleMode, filters.saleMode));
  if (filters.availabilityStatus) predicates.push(eq(properties.availabilityStatus, filters.availabilityStatus));
  if (filters.minPrice) predicates.push(gte(properties.askingPrice, filters.minPrice));
  if (filters.maxPrice) predicates.push(lte(properties.askingPrice, filters.maxPrice));
  if (filters.q) {
    const escaped = filters.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    predicates.push(or(ilike(propertyRevisions.title, "%" + escaped + "%"), ilike(propertyRevisions.description, "%" + escaped + "%"))!);
  }
  const priceSort = filters.sort.startsWith("price_");
  const ascending = filters.sort === "price_asc" || filters.sort === "deadline";
  const column = priceSort ? properties.askingPrice : filters.sort === "deadline" ? propertyRevisions.auctionEndsAt : properties.publishedAt;
  if (filters.sort === "deadline") predicates.push(isNotNull(propertyRevisions.auctionEndsAt));
  if (cursor) {
    let decoded: z.infer<typeof cursorSchema>;
    try { decoded = cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))); }
    catch { throw new AuthHttpError(422, "INVALID_CURSOR", "Cursor tidak valid."); }
    if (decoded.fingerprint !== fingerprint || priceSort !== (typeof decoded.value === "number")) throw new AuthHttpError(422, "INVALID_CURSOR", "Cursor tidak sesuai filter.");
    const value = typeof decoded.value === "number" ? decoded.value : new Date(decoded.value);
    const compare = ascending ? gt : lt;
    predicates.push(or(compare(column, value), and(eq(column, value), compare(properties.id, decoded.id)))!);
  }
  const order = ascending ? asc : desc;
  const rows = await getDatabase().select({ id: properties.id, slug: properties.slug, saleMode: properties.saleMode, availabilityStatus: properties.availabilityStatus, type: properties.type, askingPrice: properties.askingPrice, publishedAt: properties.publishedAt, title: propertyRevisions.title, description: propertyRevisions.description, location: propertyRevisions.listingSnapshot, landAreaM2: propertyRevisions.landAreaM2, buildingAreaM2: propertyRevisions.buildingAreaM2, bedroomCount: propertyRevisions.bedroomCount, auctionStartsAt: propertyRevisions.auctionStartsAt, auctionEndsAt: propertyRevisions.auctionEndsAt }).from(properties).innerJoin(propertyRevisions, eq(properties.publishedRevisionId, propertyRevisions.id)).where(and(...predicates)).orderBy(order(column), order(properties.id)).limit(filters.limit + 1);
  const items = rows.slice(0, filters.limit);
  const last = items.at(-1);
  const nextCursor = rows.length > filters.limit && last ? Buffer.from(JSON.stringify({ id: last.id, value: priceSort ? last.askingPrice : filters.sort === "deadline" ? last.auctionEndsAt?.toISOString() : last.publishedAt?.toISOString(), fingerprint })).toString("base64url") : null;
  return { items, nextCursor };
}
