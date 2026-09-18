import { z } from "zod";
import { cityProvinceByName } from "@/lib/indonesia-cities";
import { propertyTypes } from "@/lib/properties";

export const listingInput = z.object({
  sku: z.string().trim().toUpperCase().regex(/^LP-[A-Z0-9]{6,32}$/, "SKU harus memakai format LP- diikuti 6–32 huruf atau angka.").optional(),
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(4000),
  type: z.string().refine((value) => propertyTypes.includes(value)),
  city: z.string().trim().max(100),
  province: z.string().trim().max(100),
  address: z.string().trim().max(500).default(""),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  saleMode: z.enum(["auction", "direct_sale"]),
  askingPrice: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  landAreaM2: z.number().int().min(0).max(1_000_000_000),
  buildingAreaM2: z.number().int().min(0).max(1_000_000_000),
  bedroomCount: z.number().int().min(0).max(1000),
  auctionStartsAt: z.iso.datetime({ offset: true }).nullable().default(null),
  auctionEndsAt: z.iso.datetime({ offset: true }).nullable().default(null),
}).strict().superRefine((value, context) => {
  if (cityProvinceByName.get(value.city.toLocaleLowerCase("id-ID")) !== value.province) context.addIssue({ code: "custom", message: "Wilayah tidak valid." });
  if (value.saleMode === "auction" && (!value.auctionStartsAt || !value.auctionEndsAt || Date.parse(value.auctionEndsAt) <= Date.parse(value.auctionStartsAt))) context.addIssue({ code: "custom", message: "Jadwal lelang tidak valid." });
  if (value.saleMode === "direct_sale" && (value.auctionStartsAt || value.auctionEndsAt)) context.addIssue({ code: "custom", message: "Jual langsung tidak memiliki jadwal lelang." });
});

export const editInput = z.object({ version: z.number().int().positive(), listing: listingInput }).strict();
export const transitionInput = z.object({ version: z.number().int().positive(), action: z.enum(["submit", "approve", "revision", "reject", "archive", "unarchive"]), reason: z.string().trim().min(3).max(1000).optional() }).strict();
export const leadInput = z.object({ propertyId: z.uuid(), name: z.string().trim().min(2).max(120), email: z.email().max(320).optional(), phone: z.string().regex(/^\+?[0-9 ()-]{6,30}$/).optional(), message: z.string().trim().max(2000).optional(), consent: z.literal(true) }).strict().refine((value) => Boolean(value.email || value.phone), "Kontak wajib diisi.");
export const leadEditInput = z.object({ status: z.enum(["new", "contacted", "closed", "spam"]) }).strict();
export const identifier = z.uuid();
