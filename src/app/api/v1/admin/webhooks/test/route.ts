import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError } from "@/server/auth/http";
import { consumeRateLimit } from "@/server/auth/rate-limit";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, webhookEndpoints } from "@/server/db/schema";
import { decryptWebhookSecret, WebhookKeyMissingError } from "@/server/webhooks/crypto";
import { sendWebhookRequest } from "@/server/webhooks/deliver";
import { sampleLeadWebhookPayload } from "@/server/webhooks/payload";
import { sampleNotificationPayload } from "@/server/webhooks/notification";
import { webhookNameSchema } from "@/server/webhooks/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sinkron (bukan lewat outbox): admin melihat hasil seketika (status, latency, body balasan)
// sambil membuka execution log n8n untuk memetakan field. Payload identik bentuk aslinya (test:true).
export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = requireRole(await getAuthenticatedActor(), "admin");
    const webhookName = webhookNameSchema.parse(request.nextUrl.searchParams.get("name") ?? "lead_notification");
    // Kuota per webhook, bukan per admin: menguji notifikasi staf tidak menghabiskan jatah uji webhook lead.
    await consumeRateLimit("webhook:test:" + webhookName + ":" + actor.profileId, 10, 60);
    const [row] = await getDatabase().select().from(webhookEndpoints).where(eq(webhookEndpoints.name, webhookName)).limit(1);
    if (!row || !row.url || !row.secretCiphertext) throw new AuthHttpError(409, "WEBHOOK_NOT_CONFIGURED", "Isi URL dan buat secret terlebih dahulu sebelum menguji webhook.");
    let secret: string;
    try { secret = decryptWebhookSecret(row.secretCiphertext); }
    catch (error) {
      if (error instanceof WebhookKeyMissingError) throw new AuthHttpError(503, "WEBHOOK_KEY_MISSING", "WEBHOOK_SECRET_ENC_KEY belum dikonfigurasi di server.");
      throw error;
    }
    const payload = webhookName === "staff_notification" ? sampleNotificationPayload() : sampleLeadWebhookPayload();
    const result = await sendWebhookRequest(row.url, secret, payload);
    await getDatabase().insert(auditLogs).values({ actorId: actor.profileId, action: "webhook.test.fired", entityType: "webhook_endpoint", entityId: row.id, metadata: { name: webhookName, ok: result.ok, status: result.status } });
    return NextResponse.json({ data: { ...result, payloadSent: payload } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
