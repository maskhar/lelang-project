import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { properties, propertyRevisions, propertyMedia, auditLogs, outboxEvents, leads } from "@/server/db/schema";
import { requireRole, type Actor } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";
import { listingInput, transitionInput, leadInput, identifier } from "./validation";

type Listing = z.infer<typeof listingInput>;
const missing = () => new AuthHttpError(404, "NOT_FOUND", "Data tidak ditemukan.");
const conflict = () => new AuthHttpError(409, "VERSION_CONFLICT", "Data berubah. Muat ulang sebelum menyimpan.");
const regionKey = (value: string) => createHash("sha256").update(value.toLocaleLowerCase("id-ID")).digest("hex").slice(0, 10);
const snapshot = (input: Listing) => ({ city: input.city, province: input.province, saleMode: input.saleMode, type: input.type, askingPrice: input.askingPrice });
function revisionValues(input: Listing) {
  return { title: input.title, description: input.description, landAreaM2: input.landAreaM2, buildingAreaM2: input.buildingAreaM2, bedroomCount: input.bedroomCount, auctionStartsAt: input.auctionStartsAt ? new Date(input.auctionStartsAt) : null, auctionEndsAt: input.auctionEndsAt ? new Date(input.auctionEndsAt) : null };
}

export async function createListing(actor: Actor, input: Listing) {
  requireRole(actor, "editor", "admin");
  input = listingInput.parse(input);
  return getDatabase().transaction(async (transaction) => {
    const slug = randomUUID();
    const [property] = await transaction.insert(properties).values({ slug, createdBy: actor.profileId, saleMode: input.saleMode, type: input.type, provinceCode: regionKey(input.province), cityCode: regionKey(input.city), askingPrice: input.askingPrice }).returning();
    const [revision] = await transaction.insert(propertyRevisions).values({ propertyId: property.id, revisionNumber: 1, ...revisionValues(input), listingSnapshot: snapshot(input) }).returning();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.created", entityType: "property", entityId: property.id });
    return { property, revision };
  });
}

export async function editListing(actor: Actor, id: string, version: number, input: Listing) {
  id = identifier.parse(id);
  input = listingInput.parse(input);
  requireRole(actor, "editor", "admin");
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
    if (!property) throw missing();
    if (property.version !== version) throw conflict();
    if (property.publicationStatus === "archived") throw new AuthHttpError(409, "INVALID_TRANSITION", "Properti diarsipkan.");
    const [latest] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
    if (latest?.status === "pending") throw new AuthHttpError(409, "REVIEW_PENDING", "Revisi sedang diperiksa.");
    const [revision] = await transaction.insert(propertyRevisions).values({ propertyId: id, revisionNumber: (latest?.revisionNumber ?? 0) + 1, ...revisionValues(input), listingSnapshot: snapshot(input) }).returning();
    await transaction.update(properties).set({ publicationStatus: property.publishedRevisionId ? property.publicationStatus : "draft", version: version + 1, updatedAt: new Date() }).where(eq(properties.id, id));
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.edited", entityType: "property", entityId: id, metadata: { revisionId: revision.id } });
    return { revision, version: version + 1 };
  });
}

export async function transitionListing(actor: Actor, id: string, input: z.infer<typeof transitionInput>) {
  id = identifier.parse(id);
  input = transitionInput.parse(input);
  requireRole(actor, ...(input.action === "submit" ? ["editor", "admin"] as const : ["admin"] as const));
  if (["revision", "reject", "archive"].includes(input.action) && !input.reason) throw new AuthHttpError(422, "REASON_REQUIRED", "Alasan wajib diisi.");
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
    if (!property) throw missing();
    if (property.version !== input.version) throw conflict();
    const allowed = input.action === "submit" ? ["draft", "revision_required"] : input.action === "archive" ? ["draft", "pending_review", "revision_required", "published", "paused", "rejected"] : ["pending_review"];
    const [revision] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
    if (!revision) throw missing();
    const reviewAllowed = input.action === "submit" ? ["draft", "revision_required"] : ["pending"];
    if (input.action === "archive" ? !allowed.includes(property.publicationStatus) : property.publicationStatus === "archived" || !reviewAllowed.includes(revision.status)) throw new AuthHttpError(409, "INVALID_TRANSITION", "Transisi tidak valid.");
    if (input.action === "approve") {
      const media = await transaction.select().from(propertyMedia).where(eq(propertyMedia.revisionId, revision.id));
      if (!media.some((item) => item.status === "ready" && item.isCover) || media.some((item) => item.status === "pending")) throw new AuthHttpError(409, "MEDIA_NOT_READY", "Sampul siap wajib tersedia; tunggu verifikasi foto.");
    }
    const details = revision.listingSnapshot;
    if (input.action === "approve" && !details) throw new AuthHttpError(409, "SNAPSHOT_REQUIRED", "Simpan revisi baru sebelum publikasi.");
    const status = { submit: "pending_review", approve: "published", revision: "revision_required", reject: "rejected", archive: "archived" } as const;
    const review = { submit: "pending", approve: "approved", revision: "revision_required", reject: "rejected", archive: "rejected" } as const;
    await transaction.update(propertyRevisions).set({ status: review[input.action], reviewedBy: input.action === "submit" ? null : actor.profileId, reviewReason: input.reason ?? null, updatedAt: new Date() }).where(eq(propertyRevisions.id, revision.id));
    const [updated] = await transaction.update(properties).set({ publicationStatus: property.publishedRevisionId && !["approve", "archive"].includes(input.action) ? property.publicationStatus : status[input.action], version: property.version + 1, updatedAt: new Date(), ...(input.action === "approve" ? { publishedRevisionId: revision.id, publishedAt: new Date(), saleMode: details!.saleMode, type: details!.type, askingPrice: details!.askingPrice, provinceCode: regionKey(details!.province), cityCode: regionKey(details!.city) } : {}) }).where(eq(properties.id, id)).returning();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property." + input.action, entityType: "property", entityId: id, metadata: { reason: input.reason ?? null, revisionId: revision.id } });
    await transaction.insert(outboxEvents).values({ type: "property.review", payload: { propertyId: id, action: input.action } });
    return updated;
  });
}

export async function publicListing(slug: string) {
  const [row] = await getDatabase().select({ id: properties.id, revisionId: properties.publishedRevisionId, slug: properties.slug, saleMode: properties.saleMode, availabilityStatus: properties.availabilityStatus, type: properties.type, askingPrice: properties.askingPrice, publishedAt: properties.publishedAt, title: propertyRevisions.title, description: propertyRevisions.description, location: propertyRevisions.listingSnapshot, landAreaM2: propertyRevisions.landAreaM2, buildingAreaM2: propertyRevisions.buildingAreaM2, bedroomCount: propertyRevisions.bedroomCount, auctionStartsAt: propertyRevisions.auctionStartsAt, auctionEndsAt: propertyRevisions.auctionEndsAt }).from(properties).innerJoin(propertyRevisions, eq(properties.publishedRevisionId, propertyRevisions.id)).where(and(eq(properties.slug, slug), eq(properties.publicationStatus, "published")));
  if (!row) throw missing();
  const media = row.revisionId ? await getDatabase().select({ id: propertyMedia.id, contentType: propertyMedia.contentType, sortOrder: propertyMedia.sortOrder, isCover: propertyMedia.isCover }).from(propertyMedia).where(and(eq(propertyMedia.revisionId, row.revisionId), eq(propertyMedia.status, "ready"))).orderBy(asc(propertyMedia.sortOrder), asc(propertyMedia.id)) : [];
  return { ...row, media };
}

export async function staffListings(actor: Actor) {
  requireRole(actor, "editor", "admin");
  return getDatabase().select({
    id: properties.id,
    slug: properties.slug,
    saleMode: properties.saleMode,
    publicationStatus: properties.publicationStatus,
    availabilityStatus: properties.availabilityStatus,
    type: properties.type,
    askingPrice: properties.askingPrice,
    version: properties.version,
    updatedAt: properties.updatedAt,
    title: propertyRevisions.title,
    location: propertyRevisions.listingSnapshot,
  }).from(properties)
    .innerJoin(propertyRevisions, eq(propertyRevisions.propertyId, properties.id))
    .where(sql`${propertyRevisions.revisionNumber} = (select max(latest.revision_number) from app.property_revisions latest where latest.property_id = ${properties.id})`)
    .orderBy(desc(properties.updatedAt), asc(properties.id)).limit(100);
}

export async function createLead(input: z.infer<typeof leadInput>) {
  input = leadInput.parse(input);
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(and(eq(properties.id, input.propertyId), eq(properties.publicationStatus, "published"), eq(properties.availabilityStatus, "available"))).for("share");
    if (!property) throw missing();
    const [lead] = await transaction.insert(leads).values({ propertyId: input.propertyId, name: input.name, email: input.email, phone: input.phone, message: input.message, consentAt: new Date() }).returning({ id: leads.id });
    await transaction.insert(auditLogs).values({ action: "lead.created", entityType: "lead", entityId: lead.id });
    await transaction.insert(outboxEvents).values({ type: "lead.created", payload: { leadId: lead.id, propertyId: input.propertyId } });
    return lead;
  });
}

export async function dashboardSummary(actor: Actor) {
  requireRole(actor, "editor", "admin");
  const database = getDatabase();
  const listings = await database.select({ status: properties.publicationStatus, count: sql<number>`count(*)::integer` }).from(properties).groupBy(properties.publicationStatus);
  const inquiries = await database.select({ status: leads.status, count: sql<number>`count(*)::integer` }).from(leads).groupBy(leads.status);
  return { listings, leads: inquiries };
}
