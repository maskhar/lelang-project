import "server-only";
import { and, eq } from "drizzle-orm";
import type { getDatabase } from "@/server/db/client";
import { outboxEvents, webhookEndpoints } from "@/server/db/schema";

type Transaction = Pick<ReturnType<typeof getDatabase>, "insert" | "select">;

// Hanya diantre bila baris staff_notification tersimpan & enabled — instalasi yang belum memakai
// fitur ini tidak menumpuk event yang pasti dead-letter (meniru gerbang lead_notification di
// service.ts createLead). Payload sengaja minimal (siapa, kapan, aksi); detail entitas (judul, SKU)
// dibaca ulang worker saat kirim, kecuali event yang barisnya sudah hilang saat itu (lihat pemanggil).
export async function enqueueStaffNotification(transaction: Transaction, payload: Record<string, unknown>) {
  const [hook] = await transaction.select({ id: webhookEndpoints.id }).from(webhookEndpoints).where(and(eq(webhookEndpoints.name, "staff_notification"), eq(webhookEndpoints.enabled, true))).limit(1);
  if (hook) await transaction.insert(outboxEvents).values({ type: "webhook.notification", payload });
}
