import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import http from "node:http";
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
  process.env.WEBHOOK_SECRET_ENC_KEY = "c".repeat(64);
  const { createListing, editListing, transitionListing, createLead, publicListing, markListingSold, markListingAvailable } = await import("../src/server/properties/service.ts");
  const { AuthHttpError } = await import("../src/server/auth/http.ts");
  const { AuthorizationError } = await import("../src/server/auth/actor.ts");
  const { setRole, setAccountStatus } = await import("../src/server/auth/admin-users.ts");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  const profileId = randomUUID();
  const actor = { profileId, email: "backend-test@example.invalid", name: "Backend Test", roles: ["admin"] };
  const listing = { title: "Rumah pengujian backend", description: "Deskripsi valid untuk pengujian aturan domain backend.", type: "Rumah", city: "Malang", province: "Jawa Timur", saleMode: "direct_sale", askingPrice: 750000000, landAreaM2: 100, buildingAreaM2: 80, bedroomCount: 3, amenities: ["bank", "bandara"], auctionStartsAt: null, auctionEndsAt: null };
  let propertyId;
  let hookServer;
  const storage = await mkdtemp(path.join(os.tmpdir(), "lelang-backend-test-"));
  process.env.STORAGE_ROOT = storage;
  const { saveQuarantine, readPublic } = await import("../src/server/storage/local.ts");
  const { processMedia } = await import("../src/workers/process-media.ts");
  const { catalog } = await import("../src/server/properties/catalog.ts");
  const { deliverOutbox } = await import("../src/workers/deliver-outbox.ts");
  const { encryptWebhookSecret, generateWebhookSecret } = await import("../src/server/webhooks/crypto.ts");
  const { signWebhookRequest } = await import("../src/server/webhooks/sign.ts");
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
    // Notifikasi staf hanya diantre saat webhook 'staff_notification' ada + enabled; di titik ini belum
    // dikonfigurasi, jadi submit tidak boleh meninggalkan event yang pasti berakhir dead-letter.
    const outbox = await client.query("select type from app.outbox_events where payload->>'propertyId'=$1", [propertyId]); assert.equal(outbox.rows.length, 0);
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } }).png().toBuffer();
    const stored = await saveQuarantine(new File([bytes], "test.png", { type: "image/png" }));
    const mediaId = randomUUID();
    await client.query("insert into app.property_media(id,revision_id,bucket,object_path,content_type,size_bytes,checksum_sha256,is_cover) values($1,$2,'quarantine',$3,$4,$5,$6,true)", [mediaId, edited.revision.id, stored.objectPath, stored.contentType, stored.sizeBytes, stored.checksumSha256]);
    await processMedia(mediaId);
    await processMedia(mediaId);
    const approved = await transitionListing(actor, propertyId, { version: 3, action: "approve" });
    assert.equal(approved.publicationStatus, "published");
    assert.equal((await publicListing(created.property.slug)).askingPrice, listing.askingPrice);
    // Fasilitas disimpan per revisi dan diurutkan sesuai katalog, bukan sesuai urutan input.
    assert.deepEqual((await client.query("select amenities from app.property_revisions where id=$1", [edited.revision.id])).rows[0].amenities, ["bandara", "bank"]);
    assert.deepEqual((await publicListing(created.property.slug)).amenities, ["bandara", "bank"]);
    const page = await catalog(new URLSearchParams({ city: "Malang", sort: "price_asc", limit: "1" }));
    assert.equal(page.items.length, 1); assert.equal(page.items[0].id, propertyId);
    await assert.rejects(catalog(new URLSearchParams({ cursor: "invalid" })), (error) => error.code === "INVALID_CURSOR");
    const lead = await createLead({ propertyId, name: "Pengunjung", email: "visitor@example.invalid", consent: true });
    assert.ok(lead.id);
    // Webhook keluar ke endpoint eksternal (n8n): payload membawa kontak asli, ditandatangani HMAC,
    // dan hanya diantre saat baris konfigurasi ada + enabled.
    const received = [];
    hookServer = http.createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => { received.push({ method: request.method, url: request.url, headers: request.headers, body }); response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"ok":true}'); });
    });
    await new Promise((resolve) => hookServer.listen(0, "127.0.0.1", resolve));
    const hookUrl = "http://127.0.0.1:" + hookServer.address().port + "/webhook/lead";
    const hookSecret = generateWebhookSecret();
    await client.query("insert into app.webhook_endpoints(name,url,secret_ciphertext,enabled) values('lead_notification',$1,$2,true)", [hookUrl, encryptWebhookSecret(hookSecret)]);
    const webhookLead = await createLead({ propertyId, name: "Pengunjung webhook", email: "webhook@example.invalid", phone: "081200000000", message: "Minat lewat webhook", consent: true });
    const queued = await client.query("select id,payload from app.outbox_events where type='webhook.lead_created'");
    assert.equal(queued.rows.length, 1); assert.equal(queued.rows[0].payload.leadId, webhookLead.id);
    // Event lain ditahan sementara: assertion di bawah menghitung attempts secara persis, jadi hanya
    // pengiriman webhook lead yang boleh diproses pada batch ini.
    await client.query("update app.outbox_events set available_at=now() + interval '1 hour' where type<>'webhook.lead_created' and status='pending'");
    assert.equal(await deliverOutbox(), 1);
    await client.query("update app.outbox_events set available_at=now() where status='pending'");
    assert.equal(received.length, 1, "Endpoint webhook menerima tepat satu POST");
    const delivery = received[0];
    assert.equal(delivery.method, "POST"); assert.equal(delivery.url, "/webhook/lead");
    assert.equal(delivery.headers["x-lelang-event"], "lead.created");
    assert.equal(delivery.headers["x-lelang-delivery-id"], queued.rows[0].id);
    assert.equal(delivery.headers["x-lelang-signature"], signWebhookRequest(hookSecret, delivery.headers["x-lelang-timestamp"], delivery.body), "Tanda tangan HMAC cocok saat penerima menghitung ulang");
    const sent = JSON.parse(delivery.body);
    assert.equal(sent.event, "lead.created"); assert.equal(sent.test, false); assert.equal(sent.deliveryId, queued.rows[0].id);
    assert.equal(sent.lead.name, "Pengunjung webhook");
    assert.equal(sent.lead.email, "webhook@example.invalid", "Payload membawa kontak asli, bukan versi tersamar");
    assert.equal(sent.lead.phone, "081200000000");
    assert.equal(sent.property.sku, created.property.sku);
    assert.equal(sent.property.url, "http://localhost:3003/properti/" + created.property.slug);
    assert.equal((await client.query("select status from app.outbox_events where id=$1", [queued.rows[0].id])).rows[0].status, "processed");
    await client.query("update app.webhook_endpoints set enabled=false where name='lead_notification'");
    await createLead({ propertyId, name: "Pengunjung tanpa webhook", email: "no-webhook@example.invalid", consent: true });
    assert.equal((await client.query("select count(*)::int as n from app.outbox_events where type='webhook.lead_created'")).rows[0].n, 1, "Webhook nonaktif tidak mengantre event baru");
    const published = await client.query("select version from app.properties where id=$1", [propertyId]);
    await assert.rejects(markListingSold({ ...actor, roles: ["editor"] }, propertyId, { version: published.rows[0].version, reason: "Penjualan selesai" }), (error) => error instanceof AuthorizationError);
    const sold = await markListingSold(actor, propertyId, { version: published.rows[0].version, reason: "Penjualan selesai" });
    assert.equal(sold.availabilityStatus, "sold");
    await assert.rejects(createLead({ propertyId, name: "Pengunjung kedua", email: "visitor-2@example.invalid", consent: true }), (error) => error instanceof AuthHttpError && error.code === "NOT_FOUND");
    await assert.rejects(markListingSold(actor, propertyId, { version: sold.version, reason: "Tandai dua kali" }), (error) => error instanceof AuthHttpError && error.code === "INVALID_TRANSITION", "Terjual tidak bisa ditandai terjual lagi");
    await assert.rejects(markListingAvailable({ ...actor, roles: ["editor"] }, propertyId, { version: sold.version, reason: "Pembeli mundur" }), (error) => error instanceof AuthorizationError);
    const restored = await markListingAvailable(actor, propertyId, { version: sold.version, reason: "Pembeli mundur, salah tandai" });
    assert.equal(restored.availabilityStatus, "available"); assert.equal(restored.publicationStatus, "published", "Kembalikan tersedia tidak menyentuh status publikasi");
    assert.ok((await createLead({ propertyId, name: "Pengunjung ketiga", email: "visitor-3@example.invalid", consent: true })).id, "Lead kembali diterima setelah status tersedia");
    await assert.rejects(markListingAvailable(actor, propertyId, { version: restored.version, reason: "Sudah tersedia" }), (error) => error instanceof AuthHttpError && error.code === "INVALID_TRANSITION");
    const revised = await editListing(actor, propertyId, restored.version, { ...listing, askingPrice: 990000000 });
    assert.equal((await publicListing(created.property.slug)).askingPrice, listing.askingPrice);
    // Foto "ready" ikut ke revisi baru: baris DB baru (id dan object_path sendiri) dengan isi file sama,
    // sehingga edit teks/harga tidak lagi memaksa upload ulang dan approve tidak kena MEDIA_NOT_READY.
    const carried = await client.query("select id,object_path,checksum_sha256,is_cover,sort_order,status from app.property_media where revision_id=$1", [revised.revision.id]);
    assert.equal(carried.rows.length, 1, "Satu foto ready disalin ke revisi baru");
    assert.equal(carried.rows[0].status, "ready"); assert.equal(carried.rows[0].is_cover, true);
    const origin = await client.query("select object_path,checksum_sha256 from app.property_media where id=$1", [mediaId]);
    assert.equal(carried.rows[0].checksum_sha256, origin.rows[0].checksum_sha256, "Isi foto identik dengan revisi sebelumnya");
    assert.notEqual(carried.rows[0].id, mediaId); assert.notEqual(carried.rows[0].object_path, origin.rows[0].object_path, "object_path unik per baris");
    assert.deepEqual(await readPublic(carried.rows[0].object_path), await readPublic(origin.rows[0].object_path), "File fisik hasil salinan byte-identik");
    assert.equal((await client.query("select metadata->>'mediaCopied' as copied from app.audit_logs where entity_id=$1 and action='property.edited' order by created_at desc limit 1", [propertyId])).rows[0].copied, "1");
    const concurrent = await Promise.allSettled([editListing(actor, propertyId, revised.version, listing), editListing(actor, propertyId, revised.version, listing)]);
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((result) => result.status === "rejected" && result.reason.code === "VERSION_CONFLICT").length, 1);
    // Backoff + dead-letter, satu-satunya di repo ini: dipicu kegagalan webhook deterministik (port
    // tertutup, bukan bergantung SMTP yang sudah dihapus total dari worker).
    await client.query("insert into app.webhook_endpoints(name,url,secret_ciphertext,enabled) values('staff_notification',$1,$2,true)", ["http://127.0.0.1:1/closed", encryptWebhookSecret(generateWebhookSecret())]);
    const beforeSold = await client.query("select version from app.properties where id=$1", [propertyId]);
    await markListingSold(actor, propertyId, { version: beforeSold.rows[0].version, reason: "Uji retry webhook staf" });
    await deliverOutbox();
    const retry = await client.query("select status,attempts from app.outbox_events where type='webhook.notification'");
    assert.equal(retry.rows[0].status, "pending"); assert.equal(retry.rows[0].attempts, 1);
    await client.query("update app.outbox_events set attempts=7, available_at=now() where type='webhook.notification'");
    await deliverOutbox();
    const dead = await client.query("select status,attempts from app.outbox_events where type='webhook.notification'");
    assert.equal(dead.rows[0].status, "dead_letter"); assert.equal(dead.rows[0].attempts, 8);
    const afterSold = await client.query("select version,availability_status from app.properties where id=$1", [propertyId]);
    assert.equal(afterSold.rows[0].availability_status, "sold");
    await markListingAvailable(actor, propertyId, { version: afterSold.rows[0].version, reason: "Kembalikan setelah uji retry webhook" });
    // Gerbang nonaktif dipasang lagi supaya aksi uji berikutnya tidak menumpuk event ke endpoint mati.
    await client.query("update app.webhook_endpoints set enabled=false where name='staff_notification'");
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
    console.log("PASS: draft/edit/concurrency/review/publish/archive, decoded media/idempotency, salin foto ready antar-revisi, public snapshot isolation, catalog filters/cursor rejection, leads, audit/outbox, webhook retry, dead-letter, checksum rejection, admin role/status management + SELF_LOCKOUT, webhook lead terkirim + tanda tangan HMAC + gate enabled, sold/available dua arah.");
  } finally {
    if (hookServer) await new Promise((resolve) => hookServer.close(resolve));
    await client.query("delete from app.webhook_endpoints where name in ('lead_notification','staff_notification')").catch(() => undefined);
    if (propertyId) { await client.query("delete from app.outbox_events where payload->>'propertyId'=$1", [propertyId]); await client.query("delete from app.audit_logs where entity_id=$1 or actor_id=$2", [propertyId, profileId]); await client.query("delete from app.leads where property_id=$1", [propertyId]); await client.query("delete from app.properties where id=$1", [propertyId]); }
    if (storage.startsWith(path.join(os.tmpdir(), "lelang-backend-test-"))) await rm(storage, { recursive: true, force: true });
    await client.query("delete from app.profiles where id=$1", [profileId]).catch(() => undefined); await client.end().catch(() => undefined);
    const { getDatabasePool } = await import("../src/server/db/client.ts"); await getDatabasePool().end().catch(() => undefined);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
