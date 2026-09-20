import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedActor, requireRole } from "@/server/auth/actor";
import { requireCsrf } from "@/server/auth/csrf";
import { readAuthJson } from "@/server/auth/http";
import { apiErrorResponse } from "@/server/api";
import { getDatabase } from "@/server/db/client";
import { auditLogs, webhookEndpoints } from "@/server/db/schema";
import { parseWebhookUrl } from "@/server/webhooks/validation";
import { webhookNameSchema } from "@/server/webhooks/names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchInput = z.object({ url: z.string().trim().max(2000), enabled: z.boolean() }).strict();
// Nama absen = lead_notification (kompatibel mundur dengan pemanggil lama); nama asing ditolak zod,
// supaya salah ketik tidak membuat baris webhook yatim yang tak pernah dibaca worker maupun UI.
const parseName = (request: NextRequest) => webhookNameSchema.parse(request.nextUrl.searchParams.get("name") ?? "lead_notification");

// Secret tidak pernah ikut di response GET; hanya keberadaannya (hasSecret) yang dilaporkan.
export async function GET(request: NextRequest) {
  try {
    requireRole(await getAuthenticatedActor(), "admin");
    const webhookName = parseName(request);
    const [row] = await getDatabase().select().from(webhookEndpoints).where(eq(webhookEndpoints.name, webhookName)).limit(1);
    const data = row
      ? { url: row.url, enabled: row.enabled, hasSecret: Boolean(row.secretCiphertext), updatedAt: row.updatedAt }
      : { url: "", enabled: false, hasSecret: false, updatedAt: null };
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    requireCsrf(request);
    const actor = requireRole(await getAuthenticatedActor(), "admin");
    const webhookName = parseName(request);
    const input = patchInput.parse(await readAuthJson(request));
    const url = parseWebhookUrl(input.url);
    const data = await getDatabase().transaction(async (transaction) => {
      const [row] = await transaction.insert(webhookEndpoints).values({ name: webhookName, url, enabled: input.enabled, updatedBy: actor.profileId })
        .onConflictDoUpdate({ target: webhookEndpoints.name, set: { url, enabled: input.enabled, updatedBy: actor.profileId, updatedAt: new Date() } })
        .returning({ id: webhookEndpoints.id, secretCiphertext: webhookEndpoints.secretCiphertext, updatedAt: webhookEndpoints.updatedAt });
      await transaction.insert(auditLogs).values({ actorId: actor.profileId, action: "webhook.config.updated", entityType: "webhook_endpoint", entityId: row.id, metadata: { name: webhookName, url, enabled: input.enabled } });
      return { url, enabled: input.enabled, hasSecret: Boolean(row.secretCiphertext), updatedAt: row.updatedAt };
    });
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
