import { buildChatwootConfig, type ChatwootConfig } from "@/lib/chatwoot";

// Satu-satunya tempat env Chatwoot dibaca di sisi aplikasi (next.config.ts membacanya sendiri saat
// menyusun CSP, sebelum runtime aplikasi ada). Pola sama dengan src/server/contact.ts: dibaca di server,
// hasilnya dialirkan sebagai props — bukan NEXT_PUBLIC_, supaya nilainya tidak dibekukan ke bundle saat
// build dan mengganti inbox cukup restart container.
export function getChatwootConfig(): ChatwootConfig | null {
  return buildChatwootConfig(process.env.CHATWOOT_BASE_URL, process.env.CHATWOOT_WEBSITE_TOKEN);
}
