import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildChatwootConfig, chatwootCspOrigins } from "../../src/lib/chatwoot";

describe("buildChatwootConfig", () => {
  it("memakai default bila env tidak diisi", () => {
    const config = buildChatwootConfig();
    assert.deepEqual(config, { baseUrl: "https://chatwoot.carubra.com", websiteToken: "jhgTsJiuDTaVmZxvkumJYu5E" });
  });
  it("env menimpa baseUrl dan token", () => {
    assert.deepEqual(buildChatwootConfig("https://chat.contoh.id", "TOKENLAIN"), { baseUrl: "https://chat.contoh.id", websiteToken: "TOKENLAIN" });
  });
  it("membuang garis miring di akhir supaya src skrip tidak berisi // ganda", () => {
    assert.equal(buildChatwootConfig("https://chat.contoh.id///")?.baseUrl, "https://chat.contoh.id");
  });
  it("membuang path: yang dipakai hanya origin, karena entri CSP pun hanya menerima origin", () => {
    assert.equal(buildChatwootConfig("https://chat.contoh.id/sub/path")?.baseUrl, "https://chat.contoh.id");
  });
  // Mematikan widget harus benar-benar mematikan: layout melewatkan penyuntikan skrip DAN CSP kembali
  // terkunci. Kalau salah satunya bocor, kita menyisakan izin untuk host yang tidak dipakai.
  it("hanya token 'off' yang mematikan widget — mematikan harus eksplisit", () => {
    assert.equal(buildChatwootConfig(undefined, "off"), null);
    assert.equal(buildChatwootConfig(undefined, "OFF"), null);
    assert.equal(buildChatwootConfig(undefined, " off "), null);
  });
  // docker-compose.yml meneruskan ${CHATWOOT_WEBSITE_TOKEN:-}, jadi env yang tidak diisi tiba sebagai
  // string kosong. Kalau kosong diartikan "matikan", widget mati diam-diam di produksi pada konfigurasi
  // default — dan itu persis mode kegagalan WHATSAPP_NUMBER yang baru saja diperbaiki.
  it("string kosong dari compose sama dengan tidak diisi, bukan mematikan widget", () => {
    assert.deepEqual(buildChatwootConfig("", ""), { baseUrl: "https://chatwoot.carubra.com", websiteToken: "jhgTsJiuDTaVmZxvkumJYu5E" });
    assert.deepEqual(buildChatwootConfig("   ", "   "), { baseUrl: "https://chatwoot.carubra.com", websiteToken: "jhgTsJiuDTaVmZxvkumJYu5E" });
  });
  it("baseUrl cacat mematikan widget daripada menghasilkan src skrip rusak", () => {
    assert.equal(buildChatwootConfig("bukan-url"), null);
    assert.equal(buildChatwootConfig("javascript:alert(1)"), null);
    assert.equal(buildChatwootConfig("file:///etc/passwd"), null);
  });
});

describe("chatwootCspOrigins", () => {
  it("menurunkan origin websocket dari origin http (wss untuk https)", () => {
    const origins = chatwootCspOrigins(buildChatwootConfig("https://chat.contoh.id"));
    assert.equal(origins.http, "https://chat.contoh.id");
    assert.equal(origins.websocket, "wss://chat.contoh.id");
  });
  it("widget mati berarti nol origin tambahan pada CSP", () => {
    assert.deepEqual(chatwootCspOrigins(null), { http: null, websocket: null });
  });
});
