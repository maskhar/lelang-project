import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeWhatsappNumber, buildWhatsappLink } from "../../src/lib/contact";

describe("normalizeWhatsappNumber", () => {
  it("mengubah awalan 0 menjadi kode negara 62", () => {
    assert.equal(normalizeWhatsappNumber("081999900900"), "6281999900900");
  });
  it("idempoten untuk nomor yang sudah pakai 62 dan format bebas", () => {
    assert.equal(normalizeWhatsappNumber("+62 819-9990-0900"), "6281999900900");
    assert.equal(normalizeWhatsappNumber("6281999900900"), "6281999900900");
  });
  it("jatuh ke nomor default bila input sampah/kosong", () => {
    assert.equal(normalizeWhatsappNumber(""), "6281999900900");
    assert.equal(normalizeWhatsappNumber("abc"), "6281999900900");
    assert.equal(normalizeWhatsappNumber("12"), "6281999900900");
  });
});

describe("buildWhatsappLink", () => {
  it("selalu mengarah ke wa.me dengan nomor default", () => {
    const link = buildWhatsappLink({ title: "Rumah Uji", price: "Rp 90 M", address: "Kota Malang", mapsUrl: "https://www.google.com/maps?q=1,2", propertyUrl: "https://domain/properti/abc" });
    assert.match(link, /^https:\/\/wa\.me\/6281999900900\?text=/);
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
