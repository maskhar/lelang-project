import "server-only";
import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, isNotNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { properties, propertyRevisions, propertyMedia } from "@/server/db/schema";
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
  // Agregat tab memakai seluruh filter publik kecuali saleMode. Dengan begitu memilih satu tab tidak
  // menyembunyikan jumlah pada tab lain, sementara kata kunci, jenis, lokasi, harga, dan status tetap cocok.
  const facetPredicates = [eq(properties.publicationStatus, "published")];
  if (filters.type) facetPredicates.push(eq(properties.type, filters.type));
  if (filters.city) facetPredicates.push(eq(properties.cityCode, hash(filters.city.toLocaleLowerCase("id-ID")).slice(0, 10)));
  if (filters.province) facetPredicates.push(eq(properties.provinceCode, hash(filters.province.toLocaleLowerCase("id-ID")).slice(0, 10)));
  if (filters.availabilityStatus) facetPredicates.push(eq(properties.availabilityStatus, filters.availabilityStatus));
  if (filters.minPrice) facetPredicates.push(gte(properties.askingPrice, filters.minPrice));
  if (filters.maxPrice) facetPredicates.push(lte(properties.askingPrice, filters.maxPrice));
  if (filters.q) {
    const escaped = filters.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    facetPredicates.push(or(ilike(propertyRevisions.title, "%" + escaped + "%"), ilike(propertyRevisions.description, "%" + escaped + "%"))!);
  }
  if (filters.sort === "deadline") facetPredicates.push(isNotNull(propertyRevisions.auctionEndsAt));
  const predicates = [...facetPredicates];
  if (filters.saleMode) predicates.push(eq(properties.saleMode, filters.saleMode));
  const priceSort = filters.sort.startsWith("price_");
  const ascending = filters.sort === "price_asc" || filters.sort === "deadline";
  const column = priceSort ? properties.askingPrice : filters.sort === "deadline" ? propertyRevisions.auctionEndsAt : properties.publishedAt;
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
  const database = getDatabase();
  const [rows, facetRows] = await Promise.all([
    database.select({ id: properties.id, slug: properties.slug, saleMode: properties.saleMode, availabilityStatus: properties.availabilityStatus, type: properties.type, askingPrice: properties.askingPrice, publishedAt: properties.publishedAt, title: propertyRevisions.title, description: propertyRevisions.description, location: propertyRevisions.listingSnapshot, landAreaM2: propertyRevisions.landAreaM2, buildingAreaM2: propertyRevisions.buildingAreaM2, bedroomCount: propertyRevisions.bedroomCount, auctionStartsAt: propertyRevisions.auctionStartsAt, auctionEndsAt: propertyRevisions.auctionEndsAt }).from(properties).innerJoin(propertyRevisions, eq(properties.publishedRevisionId, propertyRevisions.id)).where(and(...predicates)).orderBy(order(column), order(properties.id)).limit(filters.limit + 1),
    database.select({ saleMode: properties.saleMode, availabilityStatus: properties.availabilityStatus, total: count(properties.id) }).from(properties).innerJoin(propertyRevisions, eq(properties.publishedRevisionId, propertyRevisions.id)).where(and(...facetPredicates)).groupBy(properties.saleMode, properties.availabilityStatus),
  ]);
  const items = rows.slice(0, filters.limit);
  const last = items.at(-1);
  const nextCursor = rows.length > filters.limit && last ? Buffer.from(JSON.stringify({ id: last.id, value: priceSort ? last.askingPrice : filters.sort === "deadline" ? last.auctionEndsAt?.toISOString() : last.publishedAt?.toISOString(), fingerprint })).toString("base64url") : null;
  const covers = items.length ? await getDatabase().select({ propertyId: properties.id, id: propertyMedia.id, isCover: propertyMedia.isCover })
    .from(properties).innerJoin(propertyMedia, eq(propertyMedia.revisionId, properties.publishedRevisionId))
    .where(and(inArray(properties.id, items.map((item) => item.id)), eq(properties.publicationStatus, "published"), eq(propertyMedia.status, "ready"), eq(propertyMedia.isCover, true))) : [];
  const coversByProperty = new Map(covers.map((cover) => [cover.propertyId, { id: cover.id, isCover: cover.isCover }]));
  const sum = (predicate: (row: (typeof facetRows)[number]) => boolean) => facetRows.reduce((total, row) => total + (predicate(row) ? row.total : 0), 0);
  const all = sum(() => true);
  const auction = sum((row) => row.saleMode === "auction");
  const directSale = sum((row) => row.saleMode === "direct_sale");
  // rent selalu 0: enum sale_mode hanya punya auction dan direct_sale, jadi tidak ada baris sewa yang bisa
  // terhitung. Field ini ada supaya kartu "Sewa" di beranda punya sumber angka begitu mode sewa dimodelkan.
  const rent = 0;
  const counts = {
    all, auction, directSale, rent,
    // Selisih, bukan 0 hardcode: kalau nanti nilai sale_mode baru ditambahkan ke enum, jumlahnya muncul di
    // sini alih-alih hilang diam-diam dari total.
    other: all - auction - directSale - rent,
    available: sum((row) => row.availabilityStatus === "available"),
    sold: sum((row) => row.availabilityStatus === "sold"),
  };
  return { items: items.map((item) => ({ ...item, media: coversByProperty.has(item.id) ? [coversByProperty.get(item.id)!] : [] })), nextCursor, counts };
}
