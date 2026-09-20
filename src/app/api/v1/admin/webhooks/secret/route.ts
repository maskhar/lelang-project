import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { AuthHttpError } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, webhookEndpoints } from "@/server/db/schema";
import { encryptWebhookSecret, generateWebhookSecret, WebhookKeyMissingError } from "@/server/webhooks/crypto";
import { webhookNameSchema } from "@/server/webhooks/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Secret dibuat server (32 byte acak), tidak pernah diketik admin, dan hanya dikembalikan SEKALI
// di response ini. Memutar secret membuat verifikasi lama di n8n gagal sampai nilai baru dipasang —
// UI mewajibkan konfirmasi ketik ulang sebelum memanggil endpoint ini.
export async function POST(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = requireRole(await getAuthenticatedActor(), "admin");
    const webhookName = webhookNameSchema.parse(request.nextUrl.searchParams.get("name") ?? "lead_notification");
    const secret = generateWebhookSecret();
    let ciphertext: string;
    try { ciphertext = encryptWebhookSecret(secret); }
    catch (error) {
      if (error instanceof WebhookKeyMissingError) throw new AuthHttpError(503, "WEBHOOK_KEY_MISSING", "WEBHOOK_SECRET_ENC_KEY belum dikonfigurasi di server.");
      throw error;
    }
    const data = await getDatabase().transaction(async (transaction) => {
      const [row] = await transaction.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(eq(webhookEndpoints.name, webhookName)).limit(1);
      if (!row) throw new AuthHttpError(409, "WEBHOOK_CONFIG_REQUIRED", "Simpan URL webhook terlebih dahulu sebelum membuat secret.");
      await transaction.update(webhookEndpoints).set({ secretCiphertext: ciphertext, updatedBy: actor.profileId, updatedAt: new Date() }).where(eq(webhookEndpoints.id, row.id));
      await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "webhook.secret.rotated", entityType: "webhook_endpoint", entityId: row.id, metadata: { name: webhookName } });
      return { secret };
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
