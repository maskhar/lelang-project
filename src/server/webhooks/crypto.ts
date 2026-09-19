import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

// Terpisah dari AUTH_CSRF_SECRET/AUTH_RATE_LIMIT_SECRET karena dipakai untuk enkripsi simetris
// (butuh key 32 byte tepat), bukan HMAC. Sengaja tidak masuk assertBootEnvironment: produksi yang
// sudah berjalan tanpa fitur ini tidak boleh gagal boot begitu env belum diisi setelah deploy.
export class WebhookKeyMissingError extends Error {
  constructor() { super("WEBHOOK_SECRET_ENC_KEY belum dikonfigurasi atau formatnya tidak valid."); }
}

function encryptionKey() {
  const raw = process.env.WEBHOOK_SECRET_ENC_KEY;
  if (!raw || !/^[a-f0-9]{64}$/.test(raw)) throw new WebhookKeyMissingError();
  return Buffer.from(raw, "hex");
}

export function generateWebhookSecret() {
  return randomBytes(32).toString("hex");
}

// Format tersimpan: base64(iv(12) || authTag(16) || ciphertext).
export function encryptWebhookSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptWebhookSecret(ciphertextBase64: string) {
  const buffer = Buffer.from(ciphertextBase64, "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv(algorithm, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
