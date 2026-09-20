import "server-only";
import type { Pool } from "pg";
import { parseAuthOrigin } from "@/server/env";
import { formatWib } from "@/lib/datetime";
import { propertyActionLabels } from "@/lib/property-actions";
import { roleLabels } from "@/lib/roles";
import { loadEndpoint, sendWebhookRequest } from "./deliver";

export type Envelope = {
  event: string; test: boolean; deliveryId: string;
  occurredAt: string; occurredAtWib: string;
  actor: { id: string | null; name: string };
  title: string; message: string; dashboardUrl: string;
  entity: { type: string; id: string | null; sku?: string; title?: string; url?: string } | null;
};
type OutboxEvent = { id: string; payload: Record<string, unknown> };

const dash = (path: string) => parseAuthOrigin(process.env.APP_BASE_URL).origin + path;
const str = (value: unknown) => (value == null ? null : String(value));

function envelope(input: { event: string; test?: boolean; deliveryId: string; occurredAt: string; actorId: string | null; actorName: string; title: string; message: string; dashboardUrl: string; entity?: Envelope["entity"] }): Envelope {
  return { event: input.event, test: Boolean(input.test), deliveryId: input.deliveryId, occurredAt: input.occurredAt, occurredAtWib: formatWib(input.occurredAt), actor: { id: input.actorId, name: input.actorName }, title: input.title, message: input.message, dashboardUrl: input.dashboardUrl, entity: input.entity ?? null };
}

// Batch (arsip/hapus massal) memuat sampai 10 SKU langsung di pesan; sisanya diringkas jadi
// "dan N lainnya" supaya pesan tidak meledak saat admin mengarsip/menghapus ratusan properti sekaligus.
export function summarizeEntities(entries: { sku: string }[]) {
  const shown = entries.slice(0, 10).map((entry) => entry.sku);
  const rest = entries.length - shown.length;
  return shown.join(", ") + (rest > 0 ? ", dan " + rest + " lainnya" : "");
}

async function fetchPropertySkuTitle(pool: Pool, propertyId: string) {
  const { rows } = await pool.query<{ sku: string; title: string | null }>(
    `select sku, (select title from app.property_revisions where property_id = $1 order by revision_number desc limit 1) as title from app.properties where id = $1`,
    [propertyId],
  );
  return rows[0];
}

async function buildLeadCreated(pool: Pool, event: OutboxEvent) {
  const { rows } = await pool.query<{ id: string; name: string; phone: string | null; message: string | null; created_at: string; sku: string; slug: string; title: string | null }>(
    `select l.id, l.name, l.phone, l.message, l.created_at, p.sku, p.slug, r.title
     from app.leads l join app.properties p on p.id = l.property_id
     left join app.property_revisions r on r.id = p.published_revision_id
     where l.id = $1`,
    [str(event.payload.leadId)],
  );
  const row = rows[0];
  if (!row) return null;
  const title = row.title || "(tanpa judul)";
  const propertyUrl = dash("/properti/" + row.slug);
  const message = [
    "Lead baru: " + title + " (" + row.sku + ")",
    "Dari: " + row.name + (row.phone ? " · " + row.phone : ""),
    row.message ? "Pesan: " + row.message : null,
    "Waktu: " + formatWib(row.created_at),
    "Dashboard: " + dash("/dashboard/leads"),
    "Properti: " + propertyUrl,
  ].filter(Boolean).join("\n");
  return envelope({ event: "lead.created", deliveryId: event.id, occurredAt: new Date(row.created_at).toISOString(), actorId: null, actorName: "Sistem", title: "Lead baru", message, dashboardUrl: dash("/dashboard/leads"), entity: { type: "lead", id: row.id, sku: row.sku, title, url: propertyUrl } });
}

async function buildPropertyReview(pool: Pool, event: OutboxEvent) {
  const propertyId = str(event.payload.propertyId);
  if (!propertyId) return null;
  const row = await fetchPropertySkuTitle(pool, propertyId);
  if (!row) return null;
  const action = String(event.payload.action);
  const actorName = str(event.payload.actorName) || "Sistem";
  const reason = str(event.payload.reason);
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/properties/" + propertyId);
  const message = [
    "Review properti: " + (row.title || "(tanpa judul)") + " (" + row.sku + ")",
    "Aksi: " + (propertyActionLabels["property." + action] || action) + " oleh " + actorName,
    reason ? "Alasan: " + reason : null,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].filter(Boolean).join("\n");
  return envelope({ event: "property.review", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Review properti", message, dashboardUrl, entity: { type: "property", id: propertyId, sku: row.sku, title: row.title || "", url: dashboardUrl } });
}

async function buildPropertySold(pool: Pool, event: OutboxEvent) {
  const propertyId = str(event.payload.propertyId);
  if (!propertyId) return null;
  const row = await fetchPropertySkuTitle(pool, propertyId);
  if (!row) return null;
  const actorName = str(event.payload.actorName) || "Sistem";
  const reason = str(event.payload.reason);
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/properties/" + propertyId);
  const message = [
    "Properti terjual: " + (row.title || "(tanpa judul)") + " (" + row.sku + ")",
    "Ditandai oleh: " + actorName,
    reason ? "Catatan: " + reason : null,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].filter(Boolean).join("\n");
  return envelope({ event: "property.sold", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Properti terjual", message, dashboardUrl, entity: { type: "property", id: propertyId, sku: row.sku, title: row.title || "", url: dashboardUrl } });
}

async function buildPropertyArchived(pool: Pool, event: OutboxEvent) {
  const propertyIds = Array.isArray(event.payload.propertyIds) ? event.payload.propertyIds.map(String) : [];
  if (!propertyIds.length) return null;
  const { rows } = await pool.query<{ sku: string; title: string | null }>(
    `select sku, (select title from app.property_revisions where property_id = properties.id order by revision_number desc limit 1) as title from app.properties where id = any($1::uuid[])`,
    [propertyIds],
  );
  if (!rows.length) return null;
  const actorName = str(event.payload.actorName) || "Sistem";
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/properties");
  const message = [
    "Properti diarsipkan (" + rows.length + ")",
    "SKU: " + summarizeEntities(rows),
    "Oleh: " + actorName,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].join("\n");
  return envelope({ event: "property.archived", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Properti diarsipkan", message, dashboardUrl, entity: null });
}

// Baris propertinya sudah tidak ada saat worker mengirim (hard delete) — sku/title dibaca dari
// snapshot yang disimpan saat mengantre, bukan dibaca ulang.
export function buildPropertyDeleted(event: OutboxEvent) {
  const entities = Array.isArray(event.payload.entities) ? (event.payload.entities as { sku: string; title: string }[]) : [];
  if (!entities.length) return null;
  const actorName = str(event.payload.actorName) || "Sistem";
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/properties");
  const message = [
    "Properti dihapus permanen (" + entities.length + ")",
    "SKU: " + summarizeEntities(entities),
    "Oleh: " + actorName,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].join("\n");
  return envelope({ event: "property.deleted", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Properti dihapus", message, dashboardUrl, entity: null });
}

export function buildAccessRequestReviewed(event: OutboxEvent) {
  const status = event.payload.status === "approved" ? "disetujui" : "ditolak";
  const roleLabel = roleLabels[String(event.payload.requestedRole)] ?? String(event.payload.requestedRole);
  const actorName = str(event.payload.actorName) || "Sistem";
  const requesterName = str(event.payload.requesterName) || "Pengguna";
  const note = str(event.payload.note);
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/access-requests");
  const message = [
    "Pengajuan akses " + roleLabel + " " + status,
    "Pemohon: " + requesterName,
    "Diproses oleh: " + actorName,
    note ? "Catatan: " + note : null,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].filter(Boolean).join("\n");
  return envelope({ event: "access_request.reviewed", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Pengajuan akses ditinjau", message, dashboardUrl, entity: { type: "access_request", id: str(event.payload.requestId), title: requesterName } });
}

export function buildAdminRole(event: OutboxEvent) {
  const granted = Boolean(event.payload.granted);
  const roleLabel = roleLabels[String(event.payload.role)] ?? String(event.payload.role);
  const actorName = str(event.payload.actorName) || "Sistem";
  const targetName = str(event.payload.targetName) || "Pengguna";
  const occurredAt = String(event.payload.occurredAt);
  const dashboardUrl = dash("/dashboard/users");
  const message = [
    "Role " + roleLabel + " " + (granted ? "diberikan" : "dicabut"),
    "Untuk: " + targetName,
    "Oleh: " + actorName,
    "Waktu: " + formatWib(occurredAt),
    "Dashboard: " + dashboardUrl,
  ].join("\n");
  return envelope({ event: "admin.role", deliveryId: event.id, occurredAt, actorId: str(event.payload.actorId), actorName, title: "Perubahan role", message, dashboardUrl, entity: { type: "profile", id: str(event.payload.targetId), title: targetName } });
}

const builders: Record<string, (pool: Pool, event: OutboxEvent) => Promise<Envelope | null> | Envelope | null> = {
  "lead.created": buildLeadCreated,
  "property.review": buildPropertyReview,
  "property.sold": buildPropertySold,
  "property.archived": buildPropertyArchived,
  "property.deleted": (_pool, event) => buildPropertyDeleted(event),
  "access_request.reviewed": (_pool, event) => buildAccessRequestReviewed(event),
  "admin.role": (_pool, event) => buildAdminRole(event),
};

// Dipanggil worker outbox untuk event webhook.notification. `event.payload.event` memilih builder;
// builder property.* membaca ulang sku/title terbaru dari DB (kecuali property.deleted yang
// barisnya sudah hilang), sementara actorName/occurredAt/reason adalah snapshot saat diantre —
// notifikasi menyatakan siapa berbuat APA SAAT ITU, bukan kondisi profil/timestamp saat backoff selesai.
export async function deliverNotificationWebhook(pool: Pool, event: OutboxEvent) {
  const hook = await loadEndpoint(pool, "staff_notification");
  if (!hook) return;
  const kind = String(event.payload.event);
  const builder = builders[kind];
  if (!builder) throw new Error("Unknown notification event: " + kind);
  const built = await builder(pool, event);
  if (!built) return;
  const result = await sendWebhookRequest(hook.url, hook.secret, built);
  if (!result.ok) throw new Error("Webhook delivery failed: " + (result.error || result.status));
}

export function sampleNotificationPayload(): Envelope {
  const now = new Date().toISOString();
  return envelope({ event: "property.review", test: true, deliveryId: "00000000-0000-0000-0000-000000000000", occurredAt: now, actorId: "00000000-0000-0000-0000-000000000000", actorName: "Contoh Admin", title: "Review properti", message: "Review properti: Contoh Properti (LP-CONTOH01)\nAksi: Dipublikasikan oleh Contoh Admin\nWaktu: " + formatWib(now) + "\nDashboard: " + dash("/dashboard/properties/00000000-0000-0000-0000-000000000000"), dashboardUrl: dash("/dashboard/properties/00000000-0000-0000-0000-000000000000"), entity: { type: "property", id: "00000000-0000-0000-0000-000000000000", sku: "LP-CONTOH01", title: "Contoh Properti", url: dash("/dashboard/properties/00000000-0000-0000-0000-000000000000") } });
}
