import "server-only";
import type { Pool } from "pg";
import { buildLeadWebhookPayload } from "./payload";
import { signWebhookRequest } from "./sign";
import { decryptWebhookSecret } from "./crypto";

export type WebhookSendResult = { ok: boolean; status: number | null; latencyMs: number; bodySnippet?: string; error?: string };

// redirect:"manual" — 3xx dihitung gagal, tidak pernah diikuti otomatis, supaya endpoint tidak bisa
// dibelokkan ke host lain oleh respons pihak ketiga. Dipakai baik oleh worker (pengiriman asli)
// maupun rute admin /test (pengiriman sinkron untuk pemetaan field di n8n).
export async function sendWebhookRequest(url: string, secret: string, payload: { deliveryId: string }, timeoutMs = 5000): Promise<WebhookSendResult> {
  const rawBody = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signWebhookRequest(secret, timestamp, rawBody);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        "X-Lelang-Event": "lead.created",
        "X-Lelang-Delivery-Id": payload.deliveryId,
        "X-Lelang-Timestamp": timestamp,
        "X-Lelang-Signature": signature,
      },
      body: rawBody,
    });
    const latencyMs = Date.now() - startedAt;
    const bodySnippet = (await response.text().catch(() => "")).slice(0, 2000);
    return { ok: response.status >= 200 && response.status < 300, status: response.status, latencyMs, bodySnippet };
  } catch (error) {
    return { ok: false, status: null, latencyMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Gagal mengirim webhook." };
  }
}

// Dipanggil worker outbox untuk event webhook.lead_created. Konfigurasi dan data lead/properti
// dibaca ULANG di sini (bukan dari payload outbox) supaya URL/secret/enabled terbaru yang dipakai.
// Baris hilang atau enabled=false selesai tanpa throw — webhook yang dimatikan setelah lead
// diantre tidak boleh jadi dead-letter.
export async function deliverLeadWebhook(pool: Pool, event: { id: string; payload: Record<string, unknown> }) {
  const { rows: hookRows } = await pool.query("select url, secret_ciphertext, enabled from app.webhook_endpoints where name='lead_notification'");
  const hook = hookRows[0];
  if (!hook || !hook.enabled || !hook.secret_ciphertext) return;
  const { rows: leadRows } = await pool.query(
    `select l.id, l.name, l.email, l.phone, l.message, l.created_at,
            p.id as property_id, p.sku, p.slug, p.type, p.sale_mode, p.asking_price, r.title, r.listing_snapshot
     from app.leads l
     join app.properties p on p.id = l.property_id
     left join app.property_revisions r on r.id = p.published_revision_id
     where l.id = $1`,
    [String(event.payload.leadId)],
  );
  const row = leadRows[0];
  if (!row) return;
  const snapshot = row.listing_snapshot || {};
  const payload = buildLeadWebhookPayload({
    deliveryId: event.id,
    lead: { id: row.id, name: row.name, email: row.email, phone: row.phone, message: row.message, createdAt: row.created_at },
    property: { id: row.property_id, sku: row.sku, slug: row.slug, title: row.title || "", type: row.type, saleMode: row.sale_mode, askingPrice: Number(row.asking_price), city: snapshot.city || "", province: snapshot.province || "", address: snapshot.address || null },
  });
  const result = await sendWebhookRequest(hook.url, decryptWebhookSecret(hook.secret_ciphertext), payload);
  if (!result.ok) throw new Error("Webhook delivery failed: " + (result.error || result.status));
}
