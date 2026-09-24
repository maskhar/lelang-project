// Kontak resmi yang tampil di footer, tombol WhatsApp, dan dokumen hukum. Bukan secret — aman di kode.
// Dikumpulkan di satu file supaya ganti kontak tidak perlu menyisir footer, Kebijakan Privasi, dan
// Syarat & Ketentuan satu per satu (dulu tersebar di 4 file dan sempat memakai domain yang salah).
//
// File ini SENGAJA bebas process.env: footer dirender komponen klien, dan di browser process.env hanya
// berisi variabel NEXT_PUBLIC_*. Dulu nomor dibaca di sini lewat process.env.WHATSAPP_NUMBER, sehingga
// di browser nilainya selalu undefined dan override env diam-diam tidak pernah berlaku untuk footer.
// Pembacaan env sekarang ada di src/server/contact.ts (server saja) dan hasilnya dialirkan sebagai props.
export const contactEmail = "info@lelanganproperti.my.id";

// Nomor WA tim penjualan bila WHATSAPP_NUMBER tidak diisi. Dipakai juga sebagai nilai jatuh-balik ketika
// env berisi nomor yang tidak masuk akal, supaya halaman tidak pernah menampilkan nomor rusak.
export const defaultWhatsappNumber = "085196340143";

export function normalizeWhatsappNumber(value: string | undefined | null) {
  const digits = (value || "").replace(/\D/g, "");
  const withCountryCode = digits.startsWith("0") ? "62" + digits.slice(1) : digits.startsWith("62") ? digits : digits ? "62" + digits : "";
  if (withCountryCode.length < 10 || withCountryCode.length > 15) return normalizeWhatsappNumber(defaultWhatsappNumber);
  return withCountryCode;
}

// Satu nomor dipakai untuk WhatsApp dan telepon. Ketiga bentuk diturunkan dari satu masukan supaya
// override lewat WHATSAPP_NUMBER mengubah tombol WA dan link tel: di footer sekaligus — kalau dirakit
// terpisah di tiap pemakai, keduanya bisa menunjuk nomor berbeda diam-diam.
export type ContactDetails = {
  email: string;
  /** E.164 tanpa pemisah, mis. "6285196340143". Untuk wa.me. */
  whatsappNumber: string;
  /** Bentuk yang bisa didial, mis. "+6285196340143". Untuk href tel:. */
  phoneHref: string;
  /** Bentuk untuk dibaca manusia, mis. "+62 851-9634-0143". */
  phoneLabel: string;
};

export function buildContactDetails(rawNumber?: string | null): ContactDetails {
  const whatsappNumber = normalizeWhatsappNumber(rawNumber || defaultWhatsappNumber);
  // Format baca "+62 851-9634-0143": kode negara, lalu 3-4-4 digit sisanya.
  const local = whatsappNumber.slice(2);
  const groups = [local.slice(0, 3), local.slice(3, 7), local.slice(7)].filter(Boolean);
  return { email: contactEmail, whatsappNumber, phoneHref: "+" + whatsappNumber, phoneLabel: "+62 " + groups.join("-") };
}

export function buildWhatsappLink(input: { whatsappNumber: string; title: string; price: string; address: string; mapsUrl: string; propertyUrl: string }) {
  const message = ["Halo, saya tertarik dengan properti ini:", "", "Nama Properti : " + input.title, "Harga : " + input.price, "Alamat : " + input.address, "Maps : " + input.mapsUrl, "Link Properti : " + input.propertyUrl].join("\n");
  return "https://wa.me/" + input.whatsappNumber + "?text=" + encodeURIComponent(message);
}
