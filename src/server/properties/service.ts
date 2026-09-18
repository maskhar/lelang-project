import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/server/db/client";
import { properties, propertyRevisions, propertyMedia, auditLogs, outboxEvents, leads, profiles } from "@/server/db/schema";
import { requireRole, type Actor } from "@/server/auth/actor";
import { AuthHttpError } from "@/server/auth/http";
import { discard, discardPublic } from "@/server/storage/local";
import { listingInput, transitionInput, leadInput, identifier } from "./validation";
import { denied, isAgentOnly, isBuyerOnly, isOwnerOnly, isStaff } from "./policy";

type Listing = z.infer<typeof listingInput>;
const missing = () => new AuthHttpError(404, "NOT_FOUND", "Data tidak ditemukan.");
const conflict = () => new AuthHttpError(409, "VERSION_CONFLICT", "Data berubah. Muat ulang sebelum menyimpan.");
const regionKey = (value: string) => createHash("sha256").update(value.toLocaleLowerCase("id-ID")).digest("hex").slice(0, 10);
const generatedSku = () => "LP-" + randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const snapshot = (input: Listing) => ({ city: input.city, province: input.province, address: input.address, latitude: input.latitude, longitude: input.longitude, saleMode: input.saleMode, type: input.type, askingPrice: input.askingPrice });
function revisionValues(input: Listing) {
  return { title: input.title, description: input.description, address: input.address, landAreaM2: input.landAreaM2, buildingAreaM2: input.buildingAreaM2, bedroomCount: input.bedroomCount, auctionStartsAt: input.auctionStartsAt ? new Date(input.auctionStartsAt) : null, auctionEndsAt: input.auctionEndsAt ? new Date(input.auctionEndsAt) : null };
}

export async function createListing(actor: Actor, input: Listing) {
  requireRole(actor, "editor", "admin", "owner");
  input = listingInput.parse(input);
  return getDatabase().transaction(async (transaction) => {
    let property: typeof properties.$inferSelect | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomBytes(8).toString("hex");
      const sku = input.sku || generatedSku();
      [property] = await transaction.insert(properties).values({ slug, sku, createdBy: actor.profileId, ownerId: actor.roles.includes("owner") ? actor.profileId : null, saleMode: input.saleMode, type: input.type, provinceCode: regionKey(input.province), cityCode: regionKey(input.city), askingPrice: input.askingPrice }).onConflictDoNothing().returning();
      if (property) break;
      if (input.sku) {
        const [existing] = await transaction.select({ id: properties.id }).from(properties).where(eq(properties.sku, sku)).limit(1);
        if (existing) throw new AuthHttpError(409, "SKU_CONFLICT", "SKU sudah digunakan oleh properti lain.");
      }
    }
    if (!property) throw new AuthHttpError(503, "SKU_GENERATION_FAILED", "Kode properti belum dapat dibuat. Coba simpan kembali.");
    const [revision] = await transaction.insert(propertyRevisions).values({ propertyId: property.id, revisionNumber: 1, ...revisionValues(input), listingSnapshot: snapshot(input) }).returning();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.created", entityType: "property", entityId: property.id });
    return { property, revision };
  });
}

export async function editListing(actor: Actor, id: string, version: number, input: Listing) {
  id = identifier.parse(id);
  input = listingInput.parse(input);
  requireRole(actor, "editor", "admin", "owner");
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
    if (!property) throw missing();
    if (!isStaff(actor) && property.ownerId !== actor.profileId) throw denied();
    if (property.version !== version) throw conflict();
    if (property.publicationStatus === "archived") throw new AuthHttpError(409, "INVALID_TRANSITION", "Properti diarsipkan.");
    const sku = input.sku || property.sku;
    const [existingSku] = await transaction.select({ id: properties.id }).from(properties).where(eq(properties.sku, sku)).limit(1);
    if (existingSku && existingSku.id !== id) throw new AuthHttpError(409, "SKU_CONFLICT", "SKU sudah digunakan oleh properti lain.");
    const [latest] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
    if (latest?.status === "pending") throw new AuthHttpError(409, "REVIEW_PENDING", "Revisi sedang diperiksa.");
    const [revision] = await transaction.insert(propertyRevisions).values({ propertyId: id, revisionNumber: (latest?.revisionNumber ?? 0) + 1, ...revisionValues(input), listingSnapshot: snapshot(input) }).returning();
    await transaction.update(properties).set({ sku, publicationStatus: property.publishedRevisionId ? property.publicationStatus : "draft", version: version + 1, updatedAt: new Date() }).where(eq(properties.id, id));
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.edited", entityType: "property", entityId: id, metadata: { revisionId: revision.id } });
    return { revision, version: version + 1 };
  });
}

export async function transitionListing(actor: Actor, id: string, input: z.infer<typeof transitionInput>) {
  id = identifier.parse(id);
  input = transitionInput.parse(input);
  requireRole(actor, ...(input.action === "submit" ? ["editor", "admin", "owner"] as const : ["admin"] as const));
  if (["revision", "reject", "archive"].includes(input.action) && !input.reason) throw new AuthHttpError(422, "REASON_REQUIRED", "Alasan wajib diisi.");
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
    if (!property) throw missing();
    if (input.action === "submit" && !isStaff(actor) && property.ownerId !== actor.profileId) throw denied();
    if (property.version !== input.version) throw conflict();
    const allowed = input.action === "submit" ? ["draft", "revision_required"] : input.action === "archive" ? ["draft", "pending_review", "revision_required", "published", "paused", "rejected"] : input.action === "unarchive" ? ["archived"] : ["pending_review"];
    const [revision] = await transaction.select().from(propertyRevisions).where(eq(propertyRevisions.propertyId, id)).orderBy(desc(propertyRevisions.revisionNumber)).limit(1);
    if (!revision) throw missing();
    const reviewAllowed = input.action === "submit" ? ["draft", "revision_required"] : ["pending"];
    if (["archive", "unarchive"].includes(input.action) ? !allowed.includes(property.publicationStatus) : property.publicationStatus === "archived" || !reviewAllowed.includes(revision.status)) throw new AuthHttpError(409, "INVALID_TRANSITION", "Transisi tidak valid.");
    if (input.action === "approve") {
      const media = await transaction.select().from(propertyMedia).where(eq(propertyMedia.revisionId, revision.id));
      if (!media.some((item) => item.status === "ready" && item.isCover) || media.some((item) => item.status === "pending")) throw new AuthHttpError(409, "MEDIA_NOT_READY", "Sampul siap wajib tersedia; tunggu verifikasi foto.");
    }
    const details = revision.listingSnapshot;
    if (input.action === "approve" && !details) throw new AuthHttpError(409, "SNAPSHOT_REQUIRED", "Simpan revisi baru sebelum publikasi.");
    // unarchive mengembalikan ke draft, bukan langsung published: listing harus lewat submit/approve
    // lagi supaya admin memeriksa ulang snapshot dan foto sebelum tampil publik kedua kalinya.
    const status = { submit: "pending_review", approve: "published", revision: "revision_required", reject: "rejected", archive: "archived", unarchive: "draft" } as const;
    const review = { submit: "pending", approve: "approved", revision: "revision_required", reject: "rejected", archive: "rejected", unarchive: "draft" } as const;
    await transaction.update(propertyRevisions).set({ status: review[input.action], reviewedBy: input.action === "submit" ? null : actor.profileId, reviewReason: input.reason ?? null, updatedAt: new Date() }).where(eq(propertyRevisions.id, revision.id));
    const [updated] = await transaction.update(properties).set({ publicationStatus: property.publishedRevisionId && !["approve", "archive", "unarchive"].includes(input.action) ? property.publicationStatus : status[input.action], version: property.version + 1, updatedAt: new Date(), ...(input.action === "approve" ? { publishedRevisionId: revision.id, publishedAt: new Date(), saleMode: details!.saleMode, type: details!.type, askingPrice: details!.askingPrice, provinceCode: regionKey(details!.province), cityCode: regionKey(details!.city) } : {}) }).where(eq(properties.id, id)).returning();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property." + input.action, entityType: "property", entityId: id, metadata: { reason: input.reason ?? null, revisionId: revision.id } });
    await transaction.insert(outboxEvents).values({ type: "property.review", payload: { propertyId: id, action: input.action } });
    return updated;
  });
}

export async function publicListing(slug: string) {
  const [row] = await getDatabase().select({ id: properties.id, sku: properties.sku, revisionId: properties.publishedRevisionId, slug: properties.slug, saleMode: properties.saleMode, availabilityStatus: properties.availabilityStatus, type: properties.type, askingPrice: properties.askingPrice, publishedAt: properties.publishedAt, title: propertyRevisions.title, description: propertyRevisions.description, location: propertyRevisions.listingSnapshot, landAreaM2: propertyRevisions.landAreaM2, buildingAreaM2: propertyRevisions.buildingAreaM2, bedroomCount: propertyRevisions.bedroomCount, auctionStartsAt: propertyRevisions.auctionStartsAt, auctionEndsAt: propertyRevisions.auctionEndsAt }).from(properties).innerJoin(propertyRevisions, eq(properties.publishedRevisionId, propertyRevisions.id)).where(and(eq(properties.slug, slug), eq(properties.publicationStatus, "published")));
  if (!row) throw missing();
  const media = row.revisionId ? await getDatabase().select({ id: propertyMedia.id, contentType: propertyMedia.contentType, sortOrder: propertyMedia.sortOrder, isCover: propertyMedia.isCover }).from(propertyMedia).where(and(eq(propertyMedia.revisionId, row.revisionId), eq(propertyMedia.status, "ready"))).orderBy(asc(propertyMedia.sortOrder), asc(propertyMedia.id)) : [];
  return { ...row, media };
}

export async function markListingSold(actor: Actor, id: string, value: unknown) {
  requireRole(actor, "admin");
  id = identifier.parse(id);
  const input = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) }).strict().parse(value);
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(eq(properties.id, id)).for("update");
    if (!property) throw missing();
    if (property.version !== input.version) throw conflict();
    if (property.publicationStatus !== "published" || property.availabilityStatus !== "available") throw new AuthHttpError(409, "INVALID_TRANSITION", "Hanya properti terpublikasi dan tersedia dapat ditandai terjual.");
    const [updated] = await transaction.update(properties).set({ availabilityStatus: "sold", version: property.version + 1, updatedAt: new Date() }).where(eq(properties.id, id)).returning();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "property.sold", entityType: "property", entityId: id, metadata: { reason: input.reason } });
    return updated;
  });
}

export async function staffListings(actor: Actor, filters: { status?: string; q?: string } = {}) {
  requireRole(actor, "editor", "admin", "owner");
  return getDatabase().select({
    id: properties.id,
    slug: properties.slug,
    sku: properties.sku,
    saleMode: properties.saleMode,
    publicationStatus: properties.publicationStatus,
    availabilityStatus: properties.availabilityStatus,
    type: properties.type,
    askingPrice: properties.askingPrice,
    version: properties.version,
    updatedAt: properties.updatedAt,
    title: propertyRevisions.title,
    location: propertyRevisions.listingSnapshot,
    latestRevisionStatus: propertyRevisions.status,
  }).from(properties)
    .innerJoin(propertyRevisions, eq(propertyRevisions.propertyId, properties.id))
    .where(and(sql`${propertyRevisions.revisionNumber} = (select max(latest.revision_number) from app.property_revisions latest where latest.property_id = ${properties.id})`, filters.status ? eq(properties.publicationStatus, filters.status as any) : undefined, filters.q ? sql`${propertyRevisions.title} ilike ${"%" + filters.q + "%"}` : undefined, isStaff(actor) ? undefined : eq(properties.ownerId, actor.profileId)))
    .orderBy(desc(properties.updatedAt), asc(properties.id)).limit(100);
}

export async function bulkArchiveListings(actor: Actor, ids: string[]) {
  requireRole(actor, "admin", "editor");
  const validIds = z.array(identifier).min(1).max(100).parse(ids);
  return getDatabase().transaction(async (transaction) => {
    const rows = await transaction.update(properties).set({ publicationStatus: "archived", updatedAt: new Date() }).where(inArray(properties.id, validIds)).returning({ id: properties.id });
    if (rows.length) await transaction.insert(auditLogs).values(rows.map((row) => ({ actorId: actor.profileId, action: "property.archive", entityType: "property", entityId: row.id, metadata: { bulk: true } })));
    return rows;
  });
}

// Hard delete. Revisi, foto, watchlist, dan assignment ikut terhapus lewat FK cascade; baris audit tetap
// (audit_logs.entity_id tanpa FK). Lead memakai FK NO ACTION sehingga properti berlead ditolak lebih dulu
// dengan pesan ramah. File di disk tidak ikut cascade, jadi path dikumpulkan di dalam transaksi lalu dihapus
// setelah commit — worker media.cleanup tidak bisa menemukannya lagi begitu barisnya hilang.
export async function deleteListings(actor: Actor, value: unknown) {
  requireRole(actor, "admin");
  const input = z.object({ ids: z.array(identifier).min(1).max(100), confirm: z.string() }).strict().parse(value);
  if (input.confirm !== "HAPUS") throw new AuthHttpError(422, "CONFIRM_REQUIRED", 'Ketik "HAPUS" untuk mengonfirmasi penghapusan.');
  const ids = [...new Set(input.ids)];
  const files = await getDatabase().transaction(async (transaction) => {
    const rows = await transaction.select({ id: properties.id, sku: properties.sku }).from(properties).where(inArray(properties.id, ids)).for("update");
    if (rows.length !== ids.length) throw missing();
    const blocked = await transaction.select({ propertyId: leads.propertyId, count: sql<number>`count(*)::integer` }).from(leads).where(inArray(leads.propertyId, ids)).groupBy(leads.propertyId);
    if (blocked.length) {
      const names = blocked.map((row) => rows.find((property) => property.id === row.propertyId)?.sku ?? row.propertyId).join(", ");
      throw new AuthHttpError(409, "HAS_LEADS", "Properti " + names + " memiliki lead. Arsipkan saja agar riwayat lead tetap utuh.");
    }
    const media = await transaction.select({ bucket: propertyMedia.bucket, objectPath: propertyMedia.objectPath }).from(propertyMedia).innerJoin(propertyRevisions, eq(propertyRevisions.id, propertyMedia.revisionId)).where(inArray(propertyRevisions.propertyId, ids));
    await transaction.delete(properties).where(inArray(properties.id, ids));
    await transaction.insert(auditLogs).values(rows.map((row) => ({ actorId: actor.profileId, action: "property.deleted", entityType: "property", entityId: row.id, metadata: { sku: row.sku, mediaCount: media.length } })));
    return media;
  });
  for (const file of files) await (file.bucket === "public" ? discardPublic(file.objectPath) : discard(file.objectPath)).catch(() => undefined);
  return { deleted: ids.length, mediaRemoved: files.length };
}

export async function createLead(input: z.infer<typeof leadInput>, buyerId?: string) {
  input = leadInput.parse(input);
  return getDatabase().transaction(async (transaction) => {
    const [property] = await transaction.select().from(properties).where(and(eq(properties.id, input.propertyId), eq(properties.publicationStatus, "published"), eq(properties.availabilityStatus, "available"))).for("share");
    if (!property) throw missing();
    const [lead] = await transaction.insert(leads).values({ propertyId: input.propertyId, name: input.name, email: input.email, buyerId: buyerId || null, phone: input.phone, message: input.message, consentAt: new Date() }).returning({ id: leads.id });
    await transaction.insert(auditLogs).values({ action: "lead.created", entityType: "lead", entityId: lead.id });
    await transaction.insert(outboxEvents).values({ type: "lead.created", payload: { leadId: lead.id, propertyId: input.propertyId } });
    return lead;
  });
}

// Kontak lead adalah PII (docs/PRD.md): daftar hanya memuat versi tersamar, kontak lengkap
// diambil per lead lewat revealLeadContact yang tercatat di audit log.
const maskContact = (value: string | null) => (!value ? value : value.length < 7 ? value.slice(0, 2) + "***" : value.slice(0, 3) + "***" + value.slice(-3));
const leadScope = (actor: Actor) => {
  const assigned = sql`exists (select 1 from app.property_assignments assignment where assignment.property_id = ${leads.propertyId} and assignment.agent_id = ${actor.profileId} and assignment.unassigned_at is null)`;
  return isAgentOnly(actor) ? assigned : isBuyerOnly(actor) ? eq(leads.buyerId, actor.profileId) : isOwnerOnly(actor) ? eq(properties.ownerId, actor.profileId) : undefined;
};

export async function dashboardLeads(actor: Actor) {
  requireRole(actor, "admin", "editor", "owner", "agent", "buyer");
  const rows = await getDatabase().select({ id: leads.id, propertyId: leads.propertyId, name: leads.name, email: leads.email, phone: leads.phone, message: leads.message, status: leads.status, createdAt: leads.createdAt }).from(leads).innerJoin(properties, eq(properties.id, leads.propertyId)).where(leadScope(actor)).orderBy(desc(leads.createdAt)).limit(100);
  return rows.map((row) => ({ ...row, email: maskContact(row.email), phone: maskContact(row.phone) }));
}

export async function revealLeadContact(actor: Actor, id: string) {
  id = identifier.parse(id);
  requireRole(actor, "admin", "editor", "owner", "agent", "buyer");
  const scope = leadScope(actor);
  return getDatabase().transaction(async (transaction) => {
    const [lead] = await transaction.select({ id: leads.id, propertyId: leads.propertyId, name: leads.name, email: leads.email, phone: leads.phone }).from(leads).innerJoin(properties, eq(properties.id, leads.propertyId)).where(scope ? and(eq(leads.id, id), scope) : eq(leads.id, id)).limit(1);
    if (!lead) throw missing();
    await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "lead.contact.viewed", entityType: "lead", entityId: lead.id, metadata: { propertyId: lead.propertyId } });
    return { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone };
  });
}

export async function dashboardSummary(actor: Actor) {
  requireRole(actor, "editor", "admin");
  const database = getDatabase();
  const isAdmin = actor.roles.includes("admin");
  const listings = await database.select({ status: properties.publicationStatus, count: sql<number>`count(*)::integer` }).from(properties).groupBy(properties.publicationStatus);
  const availability = await database.select({ status: properties.availabilityStatus, count: sql<number>`count(*)::integer` }).from(properties).where(eq(properties.publicationStatus, "published")).groupBy(properties.availabilityStatus);
  const saleModes = await database.select({ mode: properties.saleMode, count: sql<number>`count(*)::integer` }).from(properties).groupBy(properties.saleMode);
  const inquiries = await database.select({ status: leads.status, count: sql<number>`count(*)::integer` }).from(leads).groupBy(leads.status);
  const media = await database.select({ status: propertyMedia.status, count: sql<number>`count(*)::integer` }).from(propertyMedia).groupBy(propertyMedia.status);
  const [outbox] = await database.select({
    pending: sql<number>`count(*) filter (where ${outboxEvents.status} in ('pending','processing'))::integer`,
    deadLetter: sql<number>`count(*) filter (where ${outboxEvents.status} = 'dead_letter')::integer`,
  }).from(outboxEvents);
  const activity = await database.execute<{ day: string; leads: number; published: number; logins: number }>(sql`
    with days as (select generate_series((current_date - interval '13 days')::date, current_date, interval '1 day')::date as day)
    select to_char(days.day, 'YYYY-MM-DD') as day,
      (select count(*)::integer from app.leads l where l.created_at::date = days.day) as leads,
      (select count(*)::integer from app.properties p where p.published_at::date = days.day) as published,
      (select count(*)::integer from app.audit_logs a where a.action = 'auth.google.login' and a.created_at::date = days.day) as logins
    from days order by days.day`);
  const users = isAdmin ? await database.select({
    total: sql<number>`count(*)::integer`,
    active: sql<number>`count(*) filter (where ${profiles.status} = 'active')::integer`,
    disabled: sql<number>`count(*) filter (where ${profiles.status} = 'disabled')::integer`,
    admins: sql<number>`count(*) filter (where exists (select 1 from app.user_roles r where r.user_id = ${profiles.id} and r.role = 'admin'))::integer`,
    editors: sql<number>`count(*) filter (where exists (select 1 from app.user_roles r where r.user_id = ${profiles.id} and r.role = 'editor'))::integer`,
    activeSessions: sql<number>`(select count(*) from app.user_sessions s where s.revoked_at is null and s.expires_at > now())::integer`,
  }).from(profiles).then((rows) => rows[0]) : null;
  return { listings, availability, saleModes, leads: inquiries, media, outbox, activity: activity.rows, users };
}


