import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWhatsappNumber, buildWhatsappLink, buildContactDetails, contactEmail } from "../../src/lib/contact";

describe("normalizeWhatsappNumber", () => {
  it("mengubah awalan 0 menjadi kode negara 62", () => {
    assert.equal(normalizeWhatsappNumber("085196340143"), "6285196340143");
  });
  it("idempoten untuk nomor yang sudah pakai 62 dan format bebas", () => {
    assert.equal(normalizeWhatsappNumber("+62 851-9634-0143"), "6285196340143");
    assert.equal(normalizeWhatsappNumber("6285196340143"), "6285196340143");
  });
  it("jatuh ke nomor default bila input sampah/kosong", () => {
    assert.equal(normalizeWhatsappNumber(""), "6285196340143");
    assert.equal(normalizeWhatsappNumber("abc"), "6285196340143");
    assert.equal(normalizeWhatsappNumber("12"), "6285196340143");
  });
});

describe("buildWhatsappLink", () => {
  it("memakai nomor yang diberikan pemanggil", () => {
    const link = buildWhatsappLink({ whatsappNumber: "6285196340143", title: "Rumah Uji", price: "Rp 90 M", address: "Kota Malang", mapsUrl: "https://www.google.com/maps?q=1,2", propertyUrl: "https://domain/properti/abc" });
    assert.match(link, /^https:\/\/wa\.me\/6285196340143\?text=/);
  });
  it("meng-encode newline dan karakter khusus sehingga tidak merusak query string", () => {
    const link = buildWhatsappLink({ whatsappNumber: "6285196340143", title: "Rumah & Tanah, Siap Huni", price: "Rp 90 M", address: "Jl. Contoh No. 1", mapsUrl: "https://www.google.com/maps?q=1,2", propertyUrl: "https://domain/properti/abc" });
    assert.ok(!link.includes("\n"));
    const [, query] = link.split("?text=");
    const decoded = decodeURIComponent(query);
    assert.match(decoded, /Nama Properti : Rumah & Tanah, Siap Huni/);
    assert.match(decoded, /Harga : Rp 90 M/);
    assert.match(decoded, /Alamat : Jl\. Contoh No\. 1/);
    assert.match(decoded, /Maps : https:\/\/www\.google\.com\/maps\?q=1,2/);
    assert.match(decoded, /Link Properti : https:\/\/domain\/properti\/abc/);
  });
});

// Footer memakai kontak yang sama dengan tombol WhatsApp. Yang dijaga di sini: tel: harus berupa nomor
// E.164 yang bisa didial (tanpa spasi/strip), sedangkan label untuk dibaca manusia. Ketiganya dirakit
// buildContactDetails dari satu masukan supaya override WHATSAPP_NUMBER tidak bisa membuat footer dan
// tombol WA menunjuk nomor berbeda.
describe("buildContactDetails", () => {
  it("tel: memakai bentuk E.164 tanpa pemisah", () => {
    const contact = buildContactDetails();
    assert.equal(contact.phoneHref, "+6285196340143");
    assert.match(contact.phoneHref, /^\+\d+$/);
  });
  it("label dibaca manusia dengan pengelompokan 3-4-4", () => {
    assert.equal(buildContactDetails().phoneLabel, "+62 851-9634-0143");
  });
  it("label, tel:, dan nomor wa.me menunjuk nomor yang sama", () => {
    const contact = buildContactDetails();
    assert.equal(contact.phoneLabel.replace(/[^\d]/g, ""), contact.phoneHref.replace(/[^\d]/g, ""));
    assert.equal(contact.whatsappNumber, contact.phoneHref.slice(1));
  });
  it("email memakai domain produksi", () => {
    assert.equal(buildContactDetails().email, "info@lelanganproperti.my.id");
    assert.equal(contactEmail, "info@lelanganproperti.my.id");
  });
  // Inti perbaikan: satu masukan env menggerakkan ketiga bentuk sekaligus. Kalau override hanya
  // mengubah sebagian, footer dan tombol WhatsApp bisa menampilkan nomor berbeda di satu situs.
  it("override menggerakkan wa.me, tel:, dan label sekaligus", () => {
    const contact = buildContactDetails("0812-3456-7890");
    assert.equal(contact.whatsappNumber, "6281234567890");
    assert.equal(contact.phoneHref, "+6281234567890");
    assert.equal(contact.phoneLabel, "+62 812-3456-7890");
    assert.match(buildWhatsappLink({ whatsappNumber: contact.whatsappNumber, title: "t", price: "p", address: "a", mapsUrl: "m", propertyUrl: "u" }), /^https:\/\/wa\.me\/6281234567890\?/);
  });
  it("override yang tidak masuk akal jatuh ke default, bukan menampilkan nomor rusak", () => {
    assert.equal(buildContactDetails("12").phoneLabel, "+62 851-9634-0143");
    assert.equal(buildContactDetails("").whatsappNumber, "6285196340143");
  });
});
