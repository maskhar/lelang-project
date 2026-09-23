import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWhatsappNumber, buildWhatsappLink, phoneHref, phoneLabel, contactEmail } from "../../src/lib/contact";

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
  it("selalu mengarah ke wa.me dengan nomor default", () => {
    const link = buildWhatsappLink({ title: "Rumah Uji", price: "Rp 90 M", address: "Kota Malang", mapsUrl: "https://www.google.com/maps?q=1,2", propertyUrl: "https://domain/properti/abc" });
    assert.match(link, /^https:\/\/wa\.me\/6285196340143\?text=/);
  });
  it("meng-encode newline dan karakter khusus sehingga tidak merusak query string", () => {
    const link = buildWhatsappLink({ title: "Rumah & Tanah, Siap Huni", price: "Rp 90 M", address: "Jl. Contoh No. 1", mapsUrl: "https://www.google.com/maps?q=1,2", propertyUrl: "https://domain/properti/abc" });
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
// E.164 yang bisa didial (tanpa spasi/strip), sedangkan label untuk dibaca manusia. Keduanya diturunkan
// dari whatsappNumber supaya override WHATSAPP_NUMBER tidak membuat footer dan tombol WA berbeda diam-diam.
describe("kontak footer", () => {
  it("tel: memakai bentuk E.164 tanpa pemisah", () => {
    assert.equal(phoneHref, "+6285196340143");
    assert.match(phoneHref, /^\+\d+$/);
  });
  it("label dibaca manusia dengan pengelompokan 3-4-4", () => {
    assert.equal(phoneLabel, "+62 851-9634-0143");
  });
  it("label dan tel: menunjuk nomor yang sama", () => {
    assert.equal(phoneLabel.replace(/[^\d]/g, ""), phoneHref.replace(/[^\d]/g, ""));
  });
  it("email memakai domain produksi", () => {
    assert.equal(contactEmail, "info@lelanganproperti.my.id");
  });
});
