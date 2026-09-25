// Konfigurasi widget live chat Chatwoot. websiteToken BUKAN secret: ia memang tampil di HTML setiap
// pengunjung dan hanya mengikat percakapan ke inbox — yang rahasia adalah access token akun Chatwoot,
// dan itu tidak pernah menyentuh repo ini.
//
// File ini sengaja bebas process.env supaya aman diimpor dari mana pun, termasuk next.config.ts yang
// butuh origin-nya untuk menyusun CSP. Pembacaan env ada di src/server/chatwoot.ts.
export const defaultChatwootBaseUrl = "https://chatwoot.carubra.com";
export const defaultChatwootWebsiteToken = "jhgTsJiuDTaVmZxvkumJYu5E";

export type ChatwootConfig = { baseUrl: string; websiteToken: string };

// Mengembalikan null = widget dimatikan. Dipakai dua arah: layout melewatkan penyuntikan skripnya, dan
// next.config.ts tidak melonggarkan CSP untuk origin yang tidak dipakai. Jadi mematikan widget benar-benar
// mengembalikan CSP ke keadaan terkunci, bukan menyisakan izin menganggur.
export function buildChatwootConfig(rawBaseUrl?: string | null, rawToken?: string | null): ChatwootConfig | null {
  // Kosong diperlakukan sama dengan tidak diisi, BUKAN sebagai "matikan": docker-compose.yml meneruskan
  // ${CHATWOOT_WEBSITE_TOKEN:-} sehingga variabel yang tidak diisi tiba sebagai string kosong, bukan
  // undefined. Kalau kosong berarti mati, widget akan mati diam-diam di produksi pada konfigurasi
  // default — persis kasus yang membuat WHATSAPP_NUMBER dulu tidak pernah berlaku.
  const token = (rawToken?.trim() || defaultChatwootWebsiteToken).trim();
  // Mematikan widget karena itu harus eksplisit lewat token "off".
  if (token.toLowerCase() === "off") return null;
  const baseUrl = (rawBaseUrl?.trim() || defaultChatwootBaseUrl).trim().replace(/\/+$/, "");
  // URL cacat lebih baik mematikan widget daripada menghasilkan src skrip rusak sekaligus entri CSP rusak.
  // Protokol diperiksa pada objek URL-nya, bukan pada hasil .origin: untuk skema seperti javascript: dan
  // file:, .origin bernilai string "null" sehingga mem-parsenya lagi justru melempar.
  let parsed: URL;
  try { parsed = new URL(baseUrl); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return { baseUrl: parsed.origin, websiteToken: token };
}

// Origin yang harus diizinkan CSP. Chatwoot memuat SDK dari origin ini, membuka WebSocket ke origin yang
// sama (realtime percakapan), dan merender widgetnya di dalam iframe — jadi ketiganya wajib, bukan pilihan:
// script-src saja menghasilkan bubble yang muncul tapi tidak pernah tersambung.
export function chatwootCspOrigins(config: ChatwootConfig | null) {
  if (!config) return { http: null, websocket: null };
  return { http: config.baseUrl, websocket: config.baseUrl.replace(/^http/, "ws") };
}
