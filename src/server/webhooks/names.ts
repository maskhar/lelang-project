import { z } from "zod";

// Satu tabel webhook_endpoints, banyak baris — "name" adalah diskriminator antar-tujuan. Daftar ini
// wajib dipakai (bukan string bebas) di setiap rute admin supaya salah ketik nama tidak membuat baris
// yatim yang tidak pernah dibaca worker maupun UI.
export const webhookNames = ["lead_notification", "staff_notification"] as const;
export type WebhookName = (typeof webhookNames)[number];
export const webhookNameSchema = z.enum(webhookNames);
