import "server-only";
import { z } from "zod";

// Berbeda sengaja dari parseAuthOrigin (server/env.ts): itu memaksa HTTPS di luar localhost karena
// dipakai untuk origin aplikasi publik. URL webhook di sini bisa menunjuk instance n8n di jaringan
// privat/localhost/docker milik admin, jadi IP privat SENGAJA TIDAK diblokir. Yang dibatasi hanya
// skema (http/https saja) dan userinfo (user:pass@) supaya tidak dipakai membawa kredensial di URL.
export function parseWebhookUrl(value: unknown) {
  const raw = z.url().max(2000).parse(value);
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Skema URL webhook harus http atau https.");
  if (parsed.username || parsed.password) throw new Error("URL webhook tidak boleh menyertakan userinfo.");
  return parsed.toString();
}
