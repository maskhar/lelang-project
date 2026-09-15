import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const target = new URL(process.env.DATABASE_URL || "");
  if (target.hostname !== "127.0.0.1" || target.port !== "25433" || target.pathname !== "/lelang_test") throw new Error("Backend tests require ephemeral database on 127.0.0.1:25433/lelang_test.");
  process.env.APP_BASE_URL = "http://localhost:3003";
  process.env.AUTH_CSRF_SECRET = "a".repeat(64);
  process.env.AUTH_RATE_LIMIT_SECRET = "b".repeat(64);
  const { createListing, editListing, transitionListing, createLead, publicListing } = await import("../src/server/properties/service.ts");
  const { AuthHttpError } = await import("../src/server/auth/http.ts");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const profileId = randomUUID();
  const actor = { profileId, email: "backend-test@example.invalid", name: "Backend Test", roles: ["admin"] };
  const listing = { title: "Rumah pengujian backend", description: "Deskripsi valid untuk pengujian aturan domain backend.", type: "Rumah", city: "Malang", province: "Jawa Timur", saleMode: "direct_sale", askingPrice: 750000000, landAreaM2: 100, buildingAreaM2: 80, bedroomCount: 3, auctionStartsAt: null, auctionEndsAt: null };
  let propertyId;
  const storage = await mkdtemp(path.join(os.tmpdir(), "lelang-backend-test-"));
  process.env.STORAGE_ROOT = storage;
  const { saveQuarantine } = await import("../src/server/storage/local.ts");
  const { processMedia } = await import("../src/workers/process-media.ts");
  const { catalog } = await import("../src/server/properties/catalog.ts");
  const { deliverOutbox } = await import("../src/workers/deliver-outbox.ts");
  try {
    await client.connect();
    await client.query("insert into app.profiles(id,email,name,email_verified_at) values($1,$2,$3,now())", [profileId, actor.email, actor.name]);
    await client.query("insert into app.user_roles(user_id,role) values($1,'admin')", [profileId]);
    const created = await createListing(actor, listing); propertyId = created.property.id;
    assert.equal(created.property.version, 1); assert.equal(created.revision.revisionNumber, 1);
    await assert.rejects(editListing(actor, propertyId, 99, listing), (error) => error instanceof AuthHttpError && error.code === "VERSION_CONFLICT");
    const edited = await editListing(actor, propertyId, 1, { ...listing, title: "Rumah pengujian backend revisi" }); assert.equal(edited.version, 2);
    const submitted = await transitionListing(actor, propertyId, { version: 2, action: "submit" }); assert.equal(submitted.version, 3);
    await assert.rejects(transitionListing(actor, propertyId, { version: 3, action: "approve" }), (error) => error instanceof AuthHttpError && error.code === "MEDIA_NOT_READY");
    await assert.rejects(createLead({ propertyId, name: "Pengunjung", email: "visitor@example.invalid", consent: true }), (error) => error instanceof AuthHttpError && error.code === "NOT_FOUND");
    const audit = await client.query("select action from app.audit_logs where entity_id=$1 order by created_at", [propertyId]); assert.deepEqual(audit.rows.map((row) => row.action), ["property.created", "property.edited", "property.submit"]);
    const outbox = await client.query("select type from app.outbox_events where payload->>'propertyId'=$1", [propertyId]); assert.equal(outbox.rows.length, 1);
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const stored = await saveQuarantine(new File([bytes], "test.png", { type: "image/png" }));
    const mediaId = randomUUID();
    await client.query("insert into app.property_media(id,revision_id,bucket,object_path,content_type,size_bytes,checksum_sha256,is_cover) values($1,$2,'quarantine',$3,$4,$5,$6,true)", [mediaId, edited.revision.id, stored.objectPath, stored.contentType, stored.sizeBytes, stored.checksumSha256]);
    await processMedia(mediaId);
    await processMedia(mediaId);
    const approved = await transitionListing(actor, propertyId, { version: 3, action: "approve" });
    assert.equal(approved.publicationStatus, "published");
    assert.equal((await publicListing(created.property.slug)).askingPrice, listing.askingPrice);
    const page = await catalog(new URLSearchParams({ city: "Malang", sort: "price_asc", limit: "1" }));
    assert.equal(page.items.length, 1); assert.equal(page.items[0].id, propertyId);
    await assert.rejects(catalog(new URLSearchParams({ cursor: "invalid" })), (error) => error.code === "INVALID_CURSOR");
    const lead = await createLead({ propertyId, name: "Pengunjung", email: "visitor@example.invalid", consent: true });
    assert.ok(lead.id);
    const revised = await editListing(actor, propertyId, approved.version, { ...listing, askingPrice: 990000000 });
    assert.equal((await publicListing(created.property.slug)).askingPrice, listing.askingPrice);
    const concurrent = await Promise.allSettled([editListing(actor, propertyId, revised.version, listing), editListing(actor, propertyId, revised.version, listing)]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected" && result.reason.code === "VERSION_CONFLICT").length, 1);
    delete process.env.SMTP_HOST;
    await deliverOutbox();
    const retry = await client.query("select status,attempts from app.outbox_events where type='lead.created'");
    assert.equal(retry.rows[0].status, "pending"); assert.equal(retry.rows[0].attempts, 1);
    const current = await client.query("select version from app.properties where id=$1", [propertyId]);
    await transitionListing(actor, propertyId, { version: current.rows[0].version, action: "archive", reason: "Selesai pengujian" });
    await assert.rejects(publicListing(created.property.slug), (error) => error.code === "NOT_FOUND");
    console.log("PASS: draft/edit/concurrency/review/publish/archive, decoded media/idempotency, public snapshot isolation, catalog filters/cursor rejection, leads, audit/outbox, SMTP retry.");
  } finally {
    if (propertyId) { await client.query("delete from app.outbox_events where payload->>'propertyId'=$1", [propertyId]); await client.query("delete from app.audit_logs where entity_id=$1 or actor_id=$2", [propertyId, profileId]); await client.query("delete from app.leads where property_id=$1", [propertyId]); await client.query("delete from app.properties where id=$1", [propertyId]); }
    if (storage.startsWith(path.join(os.tmpdir(), "lelang-backend-test-"))) await rm(storage, { recursive: true, force: true });
    await client.query("delete from app.profiles where id=$1", [profileId]).catch(() => undefined); await client.end().catch(() => undefined);
    const { getDatabasePool } = await import("../src/server/db/client.ts"); await getDatabasePool().end().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
