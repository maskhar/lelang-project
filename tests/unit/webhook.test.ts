import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { beforeEach, describe, it } from "node:test";
import { decryptWebhookSecret, encryptWebhookSecret, generateWebhookSecret, WebhookKeyMissingError } from "../../src/server/webhooks/crypto";
import { buildLeadWebhookPayload, sampleLeadWebhookPayload } from "../../src/server/webhooks/payload";
import { signWebhookRequest } from "../../src/server/webhooks/sign";
import { parseWebhookUrl } from "../../src/server/webhooks/validation";

const lead = { id: "11111111-1111-1111-1111-111111111111", name: "Budi", email: "budi@example.invalid", phone: "081200000000", message: "Minat", createdAt: new Date("2026-09-20T03:00:00.000Z") };
const property = { id: "22222222-2222-2222-2222-222222222222", sku: "LP-AB12CD34", slug: "rumah-uji", title: "Rumah Uji", type: "Rumah", saleMode: "direct_sale", askingPrice: 900000000, city: "Malang", province: "Jawa Timur", address: "Jl. Uji No. 2" };

describe("buildLeadWebhookPayload", () => {
  beforeEach(() => { process.env.APP_BASE_URL = "http://localhost:3003"; });

  it("memetakan kontak lead apa adanya (tidak disamarkan) dan merakit url properti", () => {
    const payload = buildLeadWebhookPayload({ deliveryId: "33333333-3333-3333-3333-333333333333", lead, property });
    assert.equal(payload.event, "lead.created");
    assert.equal(payload.test, false);
    assert.equal(payload.deliveryId, "33333333-3333-3333-3333-333333333333");
    assert.equal(payload.lead.name, "Budi");
    assert.equal(payload.lead.email, "budi@example.invalid");
    assert.equal(payload.lead.phone, "081200000000");
    assert.equal(payload.lead.createdAt, "2026-09-20T03:00:00.000Z");
    assert.equal(payload.property.sku, "LP-AB12CD34");
    assert.equal(payload.property.url, "http://localhost:3003/properti/rumah-uji");
    assert.equal(payload.property.mapsUrl, "https://www.google.com/maps?q=" + encodeURIComponent("Jl. Uji No. 2"));
  });

  it("memakai kota sebagai kueri maps bila alamat kosong", () => {
    const payload = buildLeadWebhookPayload({ deliveryId: "x", lead, property: { ...property, address: null } });
    assert.equal(payload.property.mapsUrl, "https://www.google.com/maps?q=Malang");
    assert.equal(payload.property.address, null);
  });

  it("payload contoh bertanda test dan berbentuk sama dengan payload asli", () => {
    const sample = sampleLeadWebhookPayload();
    const real = buildLeadWebhookPayload({ deliveryId: "x", lead, property });
    assert.equal(sample.test, true);
    assert.deepEqual(Object.keys(sample), Object.keys(real));
    assert.deepEqual(Object.keys(sample.lead), Object.keys(real.lead));
    assert.deepEqual(Object.keys(sample.property), Object.keys(real.property));
  });
});

describe("signWebhookRequest", () => {
  it("menandatangani timestamp + body, bukan body saja", () => {
    const body = JSON.stringify({ event: "lead.created" });
    const expected = "sha256=" + createHmac("sha256", "rahasia").update("1758330000." + body).digest("hex");
    assert.equal(signWebhookRequest("rahasia", "1758330000", body), expected);
    assert.notEqual(signWebhookRequest("rahasia", "1758330001", body), expected);
    assert.notEqual(signWebhookRequest("rahasia-lain", "1758330000", body), expected);
  });
});

describe("parseWebhookUrl", () => {
  it("menerima http/https", () => {
    assert.equal(parseWebhookUrl("https://n8n.example.invalid/webhook/lead"), "https://n8n.example.invalid/webhook/lead");
    assert.equal(parseWebhookUrl("http://n8n.example.invalid/webhook/lead"), "http://n8n.example.invalid/webhook/lead");
  });

  // Pin keputusan sadar: instance n8n admin memang bisa berada di localhost/jaringan docker internal,
  // jadi host privat TIDAK diblokir di sini. Kalau tes ini berubah, itu keputusan desain baru.
  it("mengizinkan localhost dan host jaringan privat", () => {
    assert.equal(parseWebhookUrl("http://localhost:5678/webhook/lead"), "http://localhost:5678/webhook/lead");
    assert.equal(parseWebhookUrl("http://127.0.0.1:5678/webhook/lead"), "http://127.0.0.1:5678/webhook/lead");
    assert.equal(parseWebhookUrl("http://n8n:5678/webhook/lead"), "http://n8n:5678/webhook/lead");
    assert.equal(parseWebhookUrl("http://10.0.0.5/webhook/lead"), "http://10.0.0.5/webhook/lead");
  });

  it("menolak skema lain, userinfo, dan nilai bukan URL", () => {
    assert.throws(() => parseWebhookUrl("ftp://n8n.example.invalid/webhook"), /skema|Skema|URL/);
    assert.throws(() => parseWebhookUrl("http://user:pass@n8n.example.invalid/webhook"), /userinfo/);
    assert.throws(() => parseWebhookUrl("bukan-url"));
    assert.throws(() => parseWebhookUrl(""));
    assert.throws(() => parseWebhookUrl(null));
  });
});

describe("enkripsi secret webhook", () => {
  beforeEach(() => { process.env.WEBHOOK_SECRET_ENC_KEY = "c".repeat(64); });

  it("round-trip menghasilkan secret yang sama dan ciphertext yang selalu berbeda", () => {
    const secret = generateWebhookSecret();
    assert.match(secret, /^[a-f0-9]{64}$/);
    const first = encryptWebhookSecret(secret);
    const second = encryptWebhookSecret(secret);
    assert.notEqual(first, second);
    assert.equal(decryptWebhookSecret(first), secret);
    assert.equal(decryptWebhookSecret(second), secret);
  });

  it("menolak ciphertext yang diutak-atik (auth tag GCM)", () => {
    const stored = encryptWebhookSecret("rahasia-webhook");
    const buffer = Buffer.from(stored, "base64");
    buffer[buffer.length - 1] ^= 0xff;
    assert.throws(() => decryptWebhookSecret(buffer.toString("base64")));
    const tagTampered = Buffer.from(stored, "base64");
    tagTampered[14] ^= 0xff;
    assert.throws(() => decryptWebhookSecret(tagTampered.toString("base64")));
  });

  it("melempar WebhookKeyMissingError bila kunci kosong atau formatnya salah", () => {
    const stored = encryptWebhookSecret("rahasia-webhook");
    delete process.env.WEBHOOK_SECRET_ENC_KEY;
    assert.throws(() => encryptWebhookSecret("x"), WebhookKeyMissingError);
    assert.throws(() => decryptWebhookSecret(stored), WebhookKeyMissingError);
    process.env.WEBHOOK_SECRET_ENC_KEY = "bukan-hex";
    assert.throws(() => encryptWebhookSecret("x"), WebhookKeyMissingError);
    process.env.WEBHOOK_SECRET_ENC_KEY = "C".repeat(64);
    assert.throws(() => encryptWebhookSecret("x"), WebhookKeyMissingError);
  });

  it("kunci berbeda tidak bisa mendekripsi secret lama", () => {
    const stored = encryptWebhookSecret("rahasia-webhook");
    process.env.WEBHOOK_SECRET_ENC_KEY = "d".repeat(64);
    assert.throws(() => decryptWebhookSecret(stored));
  });
});
