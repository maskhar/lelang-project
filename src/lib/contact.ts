// Kontak resmi yang tampil di footer dan dokumen hukum. Bukan secret — aman di kode. Dikumpulkan di
// satu file supaya ganti kontak tidak perlu menyisir footer, Kebijakan Privasi, dan Syarat & Ketentuan
// satu per satu (dulu tersebar di 4 file dan sempat memakai domain yang salah).
export const contactEmail = "info@lelanganproperti.my.id";

// Nomor WA tim penjualan. WHATSAPP_NUMBER opsional untuk override tanpa rebuild image Docker
// (lihat .env.docker.example).
const defaultWhatsappNumber = "085196340143";

export function normalizeWhatsappNumber(value: string | undefined | null) {
  const digits = (value || "").replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : digits ? "62" + digits : "";
  if (withCountryCode.length < 10 || withCountryCode.length > 15) return normalizeWhatsappNumber(defaultWhatsappNumber);
  return withCountryCode;
}

export const whatsappNumber = normalizeWhatsappNumber(process.env.WHATSAPP_NUMBER || defaultWhatsappNumber);

// Satu nomor dipakai untuk WhatsApp dan telepon. Diturunkan dari whatsappNumber supaya override lewat
// WHATSAPP_NUMBER ikut mengubah link tel: di footer — kalau ditulis terpisah, keduanya bisa berbeda diam-diam.
export const phoneHref = "+" + whatsappNumber;
// Format baca "+62 851-9634-0143": kode negara, lalu 3-4-4 digit sisanya.
export const phoneLabel = (() => {
  const local = whatsappNumber.slice(2);
  const groups = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return "+62 " + groups.join("-");
})();

export function buildWhatsappLink(input: { title: string; price: string; address: string; mapsUrl: string; propertyUrl: string }) {
  const message = ["Halo, saya tertarik dengan properti ini:", "", "Nama Properti : " + input.title, "Harga : " + input.price, "Alamat : " + input.address, "Maps : " + input.mapsUrl, "Link Properti : " + input.propertyUrl].join("\n");
  return "https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent(message);
}
