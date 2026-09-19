// Nomor WA tim penjualan. Bukan secret — aman di kode; WHATSAPP_NUMBER opsional untuk override
// tanpa rebuild image Docker (lihat .env.docker.example).
const defaultWhatsappNumber = "081999900900";

export function normalizeWhatsappNumber(value: string | undefined | null) {
  const digits = (value || "").replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : digits ? "62" + digits : "";
  if (withCountryCode.length < 10 || withCountryCode.length > 15) return normalizeWhatsappNumber(defaultWhatsappNumber);
  return withCountryCode;
}

export const whatsappNumber = normalizeWhatsappNumber(process.env.WHATSAPP_NUMBER || defaultWhatsappNumber);

export function buildWhatsappLink(input: { title: string; price: string; address: string; mapsUrl: string; propertyUrl: string }) {
  const message = ["Halo, saya tertarik dengan properti ini:", "", "Nama Properti : " + input.title, "Harga : " + input.price, "Alamat : " + input.address, "Maps : " + input.mapsUrl, "Link Properti : " + input.propertyUrl].join("\n");
  return "https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent(message);
}
