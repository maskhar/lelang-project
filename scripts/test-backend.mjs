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
  const { createListing, editListing, transitionListing, createLead, publicListing, markListingSold } = await import("../src/server/properties/service.ts");
  const { AuthHttpError } = await import("../src/server/auth/http.ts");
  const { AuthorizationError } = await import("../src/server/auth/actor.ts");
  const { setRole, setAccountStatus } = await import("../src/server/auth/admin-users.ts");
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
    assert.match(created.property.sku, /^LP-[A-Z0-9]{8}$/);
    await assert.rejects(createListing(actor, { ...listing, sku: created.property.sku }), (error) => error instanceof AuthHttpError && error.code === "SKU_CONFLICT");
    await assert.rejects(editListing(actor, propertyId, 99, listing), (error) => error instanceof AuthHttpError && error.code === "VERSION_CONFLICT");
    const edited = await editListing(actor, propertyId, 1, { ...listing, title: "Rumah pengujian backend revisi" }); assert.equal(edited.version, 2);
    const submitted = await transitionListing(actor, propertyId, { version: 2, action: "submit" }); assert.equal(submitted.version, 3);
    await assert.rejects(transitionListing(actor, propertyId, { version: 3, action: "approve" }), (error) => error instanceof AuthHttpError && error.code === "MEDIA_NOT_READY");
    await assert.rejects(createLead({ propertyId, name: "Pengunjung", email: "visitor@example.invalid", consent: true }), (error) => error instanceof AuthHttpError && error.code === "NOT_FOUND");
    const audit = await client.query("select action from app.audit_logs where entity_id=$1", [propertyId]); assert.deepEqual(audit.rows.map((row) => row.action).sort(), ["property.created", "property.edited", "property.submit"]);
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
    const published = await client.query("select version from app.properties where id=$1", [propertyId]);
    await assert.rejects(markListingSold({ ...actor, roles: ["editor"] }, propertyId, { version: published.rows[0].version, reason: "Penjualan selesai" }), (error) => error instanceof AuthorizationError);
    const sold = await markListingSold(actor, propertyId, { version: published.rows[0].version, reason: "Penjualan selesai" });
    assert.equal(sold.availabilityStatus, "sold");
    await assert.rejects(createLead({ propertyId, name: "Pengunjung kedua", email: "visitor-2@example.invalid", consent: true }), (error) => error instanceof AuthHttpError && error.code === "NOT_FOUND");
    await client.query("update app.properties set availability_status='available', version=version+1 where id=$1", [propertyId]);
    const revisedVersion = (await client.query("select version from app.properties where id=$1", [propertyId])).rows[0].version;
    const revised = await editListing(actor, propertyId, revisedVersion, { ...listing, askingPrice: 990000000 });
    assert.equal((await publicListing(created.property.slug)).askingPrice, listing.askingPrice);
    const concurrent = await Promise.allSettled([editListing(actor, propertyId, revised.version, listing), editListing(actor, propertyId, revised.version, listing)]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected" && result.reason.code === "VERSION_CONFLICT").length, 1);
    delete process.env.SMTP_HOST;
    await deliverOutbox();
    const retry = await client.query("select status,attempts from app.outbox_events where type='lead.created'");
    assert.equal(retry.rows[0].status, "pending"); assert.equal(retry.rows[0].attempts, 1);
    await client.query("update app.outbox_events set attempts=7, available_at=now() where type='lead.created'");
    await deliverOutbox();
    const dead = await client.query("select status,attempts from app.outbox_events where type='lead.created'");
    assert.equal(dead.rows[0].status, "dead_letter"); assert.equal(dead.rows[0].attempts, 8);
    const tamperedId = randomUUID();
    const tampered = await saveQuarantine(new File([bytes], "tampered.png", { type: "image/png" }));
    await client.query("insert into app.property_media(id,revision_id,bucket,object_path,content_type,size_bytes,checksum_sha256,is_cover) values($1,$2,'quarantine',$3,$4,$5,$6,false)", [tamperedId, edited.revision.id, tampered.objectPath, tampered.contentType, tampered.sizeBytes, "0".repeat(64)]);
    await processMedia(tamperedId);
    const rejected = await client.query("select status,bucket from app.property_media where id=$1", [tamperedId]);
    assert.equal(rejected.rows[0].status, "rejected"); assert.equal(rejected.rows[0].bucket, "quarantine");
    const current = await client.query("select version from app.properties where id=$1", [propertyId]);
    await transitionListing(actor, propertyId, { version: current.rows[0].version, action: "archive", reason: "Selesai pengujian" });
    await assert.rejects(publicListing(created.property.slug), (error) => error.code === "NOT_FOUND");
    // Listing terarsip: semua aksi lain ditolak; hanya admin boleh unarchive, dan hasilnya draft (bukan
    // langsung published) meski published_revision_id masih terisi — wajib submit/approve ulang.
    const archivedVersion = (await client.query("select version, published_revision_id from app.properties where id=$1", [propertyId])).rows[0];
    assert.ok(archivedVersion.published_revision_id, "Properti uji pernah published sebelum diarsipkan");
    for (const action of ["submit", "approve", "archive"]) await assert.rejects(transitionListing(actor, propertyId, { version: archivedVersion.version, action, reason: "x-uji" }), (error) => error instanceof AuthHttpError && error.code === "INVALID_TRANSITION", "Aksi " + action + " ditolak saat archived");
    await assert.rejects(editListing(actor, propertyId, archivedVersion.version, listing), (error) => error instanceof AuthHttpError && error.code === "INVALID_TRANSITION");
    await assert.rejects(transitionListing({ ...actor, roles: ["editor"] }, propertyId, { version: archivedVersion.version, action: "unarchive" }), (error) => error instanceof AuthorizationError);
    const unarchived = await transitionListing(actor, propertyId, { version: archivedVersion.version, action: "unarchive" });
    assert.equal(unarchived.publicationStatus, "draft"); assert.equal(unarchived.version, archivedVersion.version + 1);
    await assert.rejects(publicListing(created.property.slug), (error) => error.code === "NOT_FOUND", "Draft hasil unarchive tidak tampil publik");
    await assert.rejects(transitionListing(actor, propertyId, { version: unarchived.version, action: "unarchive" }), (error) => error instanceof AuthHttpError && error.code === "INVALID_TRANSITION", "Unarchive hanya berlaku pada archived");
    // Submit pada properti ber-published_revision_id tidak mengubah publicationStatus (desain existing:
    // status publik hanya berubah lewat approve/archive/unarchive); antrean review membaca status revisi.
    const resubmitted = await transitionListing(actor, propertyId, { version: unarchived.version, action: "submit" });
    assert.equal(resubmitted.publicationStatus, "draft");
    const pendingRevision = await client.query("select status from app.property_revisions where property_id=$1 order by revision_number desc limit 1", [propertyId]);
    assert.equal(pendingRevision.rows[0].status, "pending");
    const unarchiveAudit = await client.query("select count(*)::int as n from app.audit_logs where entity_id=$1 and action='property.unarchive'", [propertyId]);
    assert.equal(unarchiveAudit.rows[0].n, 1, "Audit property.unarchive tercatat sekali");
    // Manajemen role/status akun oleh admin (Piece 2): grant/revoke role, disable/enable akun,
    // penjaga SELF_LOCKOUT, dan pencabutan sesi target di dalam transaksi yang sama.
    const targetId = randomUUID();
    await client.query("insert into app.profiles(id,email,name,email_verified_at) values($1,$2,$3,now())", [targetId, "target-admin-users@example.invalid", "Target Uji"]);
    await client.query("insert into app.user_sessions(user_id,token_hash,expires_at) values($1,$2,now() + interval '1 hour')", [targetId, "c".repeat(64)]);
    const expectHttp = (code) => (error) => error instanceof AuthHttpError && error.code === code;
    await assert.rejects(setRole({ ...actor, roles: ["editor"] }, targetId, "buyer", true), (error) => error instanceof AuthorizationError);
    const granted = await setRole(actor, targetId, "buyer", true);
    assert.deepEqual(granted, { id: targetId, role: "buyer", granted: true });
    await assert.rejects(setRole(actor, targetId, "buyer", true), expectHttp("ROLE_EXISTS"));
    const revokedSessions = await client.query("select count(*)::int as n from app.user_sessions where user_id=$1 and revoked_at is null", [targetId]);
    assert.equal(revokedSessions.rows[0].n, 0, "Sesi target dicabut saat role berubah");
    const revoked = await setRole(actor, targetId, "buyer", false);
    assert.deepEqual(revoked, { id: targetId, role: "buyer", granted: false });
    await assert.rejects(setRole(actor, targetId, "buyer", false), expectHttp("ROLE_NOT_FOUND"));
    await assert.rejects(setRole(actor, randomUUID(), "buyer", true), expectHttp("USER_NOT_FOUND"));
    await client.query("insert into app.user_sessions(user_id,token_hash,expires_at) values($1,$2,now() + interval '1 hour')", [targetId, "d".repeat(64)]);
    const disabled = await setAccountStatus(actor, targetId, "disabled");
    assert.deepEqual(disabled, { id: targetId, status: "disabled" });
    assert.equal((await client.query("select count(*)::int as n from app.user_sessions where user_id=$1 and revoked_at is null", [targetId])).rows[0].n, 0, "Sesi target dicabut saat disable");
    await assert.rejects(setAccountStatus(actor, targetId, "disabled"), expectHttp("STATUS_UNCHANGED"));
    const enabled = await setAccountStatus(actor, targetId, "active");
    assert.deepEqual(enabled, { id: targetId, status: "active" });
    await assert.rejects(setAccountStatus(actor, randomUUID(), "disabled"), expectHttp("USER_NOT_FOUND"));
    await assert.rejects(setRole(actor, profileId, "admin", false), expectHttp("SELF_LOCKOUT"));
    await assert.rejects(setAccountStatus(actor, profileId, "disabled"), expectHttp("SELF_LOCKOUT"));
    // created_at bisa tie antar transaksi (resolusi clock), dan order by created_at tanpa tiebreak
    // tidak deterministik — bandingkan sebagai himpunan terurut, bukan urutan insert.
    const adminAudit = await client.query("select action from app.audit_logs where entity_id=$1 and action like 'admin.%'", [targetId]);
    assert.deepEqual(adminAudit.rows.map((row) => row.action).sort(), ["admin.account.disabled", "admin.account.enabled", "admin.role.granted", "admin.role.revoked"]);
    await client.query("delete from app.audit_logs where entity_id=$1", [targetId]);
    await client.query("delete from app.profiles where id=$1", [targetId]);
    console.log("PASS: draft/edit/concurrency/review/publish/archive, decoded media/idempotency, public snapshot isolation, catalog filters/cursor rejection, leads, audit/outbox, SMTP retry, dead-letter, checksum rejection, admin role/status management + SELF_LOCKOUT.");
  } finally {
    if (propertyId) { await client.query("delete from app.outbox_events where payload->>'propertyId'=$1", [propertyId]); await client.query("delete from app.audit_logs where entity_id=$1 or actor_id=$2", [propertyId, profileId]); await client.query("delete from app.leads where property_id=$1", [propertyId]); await client.query("delete from app.properties where id=$1", [propertyId]); }
    if (storage.startsWith(path.join(os.tmpdir(), "lelang-backend-test-"))) await rm(storage, { recursive: true, force: true });
    await client.query("delete from app.profiles where id=$1", [profileId]).catch(() => undefined); await client.end().catch(() => undefined);
    const { getDatabasePool } = await import("../src/server/db/client.ts"); await getDatabasePool().end().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
