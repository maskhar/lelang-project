import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listingInput, leadInput } from "../../src/server/properties/validation";

const validListing = {
  title: "Rumah minimalis siap huni",
  description: "Deskripsi properti yang cukup panjang untuk lolos validasi minimal dua puluh karakter.",
  type: "Rumah",
  city: "Jakarta Selatan",
  province: "DKI Jakarta",
  saleMode: "direct_sale" as const,
  askingPrice: 1_000_000_000,
  landAreaM2: 120,
  buildingAreaM2: 90,
  bedroomCount: 3,
};

describe("listingInput", () => {
  it("accepts a valid direct-sale listing", () => {
    assert.doesNotThrow(() => listingInput.parse(validListing));
  });

  it("rejects city/province mismatch", () => {
    assert.throws(() => listingInput.parse({ ...validListing, province: "Jawa Barat" }));
  });

  it("requires auction schedule for auction mode", () => {
    assert.throws(() => listingInput.parse({ ...validListing, saleMode: "auction" }));
  });

  it("rejects auction schedule where end precedes start", () => {
    assert.throws(() => listingInput.parse({
      ...validListing, saleMode: "auction",
      auctionStartsAt: "2026-01-02T00:00:00Z", auctionEndsAt: "2026-01-01T00:00:00Z",
    }));
  });

  it("rejects direct-sale listing carrying an auction schedule", () => {
    assert.throws(() => listingInput.parse({ ...validListing, auctionStartsAt: "2026-01-01T00:00:00Z" }));
  });

  it("rejects unknown property type", () => {
    assert.throws(() => listingInput.parse({ ...validListing, type: "Kapal" }));
  });

  it("defaults amenities to an empty list", () => {
    assert.deepEqual(listingInput.parse(validListing).amenities, []);
  });

  it("deduplicates amenities and orders them by catalog", () => {
    const value = listingInput.parse({ ...validListing, amenities: ["furnished", "bandara", "bank", "bandara"] });
    assert.deepEqual(value.amenities, ["bandara", "bank", "furnished"]);
  });

  it("rejects unknown amenity keys", () => {
    assert.equal(listingInput.safeParse({ ...validListing, amenities: ["kolam_renang"] }).success, false);
  });
});

describe("leadInput", () => {
  const base = { propertyId: "123e4567-e89b-12d3-a456-426614174000", name: "Budi Santoso", consent: true as const };

  it("requires at least one contact channel", () => {
    assert.throws(() => leadInput.parse(base));
    assert.doesNotThrow(() => leadInput.parse({ ...base, email: "budi@example.com" }));
    assert.doesNotThrow(() => leadInput.parse({ ...base, phone: "+62 812-3456-7890" }));
  });

  it("rejects consent false", () => {
    assert.throws(() => leadInput.parse({ ...base, email: "budi@example.com", consent: false }));
  });
});
