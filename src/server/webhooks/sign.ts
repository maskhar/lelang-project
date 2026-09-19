import "server-only";
import { createHmac } from "node:crypto";

// Timestamp ikut ditandatangani supaya n8n bisa menolak request basi (replay); tidak ada nonce
// store di sisi aplikasi ini — jendela replay ditangani oleh workflow n8n itu sendiri.
export function signWebhookRequest(secret: string, timestamp: string, rawBody: string) {
  return "sha256=" + createHmac("sha256", secret).update(timestamp + "." + rawBody).digest("hex");
}
