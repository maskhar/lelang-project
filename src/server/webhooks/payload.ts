import "server-only";
import { parseAuthOrigin } from "@/server/env";

type LeadPayloadInput = {
  deliveryId: string;
  test?: boolean;
  lead: { id: string; name: string; email: string | null; phone: string | null; message: string | null; createdAt: Date | string };
  property: { id: string; sku: string; slug: string; title: string; type: string; saleMode: string; askingPrice: number; city: string; province: string; address: string | null };
};

// Bentuk payload dipakai identik oleh pengiriman asli (worker) dan tombol test admin (test: true),
// supaya pemetaan field yang dibuat admin di n8n memakai contoh langsung cocok saat lead betulan
// masuk. url/mapsUrl dirakit di sini (pola sama seperti src/lib/contact.ts) supaya n8n tidak perlu
// menyusun link sendiri untuk pesan WhatsApp.
export function buildLeadWebhookPayload(input: LeadPayloadInput) {
  const origin = parseAuthOrigin(process.env.APP_BASE_URL).origin;
  const propertyUrl = origin + "/properti/" + input.property.slug;
  const mapsUrl = "https://www.google.com/maps?q=" + encodeURIComponent(input.property.address || input.property.city);
  return {
    event: "lead.created",
    test: Boolean(input.test),
    deliveryId: input.deliveryId,
    occurredAt: new Date().toISOString(),
    lead: {
      id: input.lead.id,
      name: input.lead.name,
      email: input.lead.email,
      phone: input.lead.phone,
      message: input.lead.message,
      createdAt: input.lead.createdAt instanceof Date ? input.lead.createdAt.toISOString() : input.lead.createdAt,
    },
    property: {
      id: input.property.id,
      sku: input.property.sku,
      slug: input.property.slug,
      title: input.property.title,
      type: input.property.type,
      saleMode: input.property.saleMode,
      askingPrice: input.property.askingPrice,
      city: input.property.city,
      province: input.property.province,
      address: input.property.address,
      url: propertyUrl,
      mapsUrl,
    },
  };
}

export function sampleLeadWebhookPayload() {
  return buildLeadWebhookPayload({
    deliveryId: "00000000-0000-0000-0000-000000000000",
    test: true,
    lead: { id: "00000000-0000-0000-0000-000000000000", name: "Contoh Nama", email: "contoh@example.invalid", phone: "081200000000", message: "Ini contoh pesan lead untuk pemetaan field di n8n.", createdAt: new Date() },
    property: { id: "00000000-0000-0000-0000-000000000000", sku: "LP-CONTOH01", slug: "contoh-properti", title: "Contoh Properti", type: "Rumah", saleMode: "direct_sale", askingPrice: 500000000, city: "Malang", province: "Jawa Timur", address: "Jl. Contoh No. 1" },
  });
}
