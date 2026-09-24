import { buildContactDetails, type ContactDetails } from "@/lib/contact";

// Satu-satunya tempat WHATSAPP_NUMBER dibaca. Harus server: footer dirender komponen klien, dan di
// browser process.env hanya memuat NEXT_PUBLIC_*. Sebelumnya env dibaca di src/lib/contact.ts yang ikut
// terbundel ke klien, jadi override diam-diam tidak berlaku untuk footer sementara tombol WhatsApp
// (server component) menurut — dua nomor berbeda di satu situs tanpa ada yang menyadarinya.
//
// Pemanggilnya adalah server component, yang mengalirkan hasilnya ke komponen klien sebagai props.
// Nomor ini bukan secret (memang tampil di halaman publik), tapi tetap tidak dijadikan NEXT_PUBLIC_
// supaya nilainya tidak ikut dibekukan ke dalam bundle saat build: lewat props, ganti nomor cukup
// restart container, tanpa rebuild image.
export function getContactDetails(): ContactDetails {
  return buildContactDetails(process.env.WHATSAPP_NUMBER);
}
