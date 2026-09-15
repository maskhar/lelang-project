export type CatalogView = {
  id: string; mode: "lelang" | "langsung" | "terjual"; title: string; type: string; city: string;
  land: number; build: number; beds: number; price: number; desc: string;
  imageUrl?: string; imageUrls?: string[]; createdAt?: string; auctionEndsAt?: string | null;
  bid?: number; bidders?: number; duration?: number;
};
export type PublicListing = {
  id: string; slug: string; saleMode: string; availabilityStatus: string; title: string; type: string;
  askingPrice: number; description: string; landAreaM2: number; buildingAreaM2: number; bedroomCount: number;
  publishedAt: string | Date | null; auctionEndsAt: string | Date | null;
  location: { city: string; province: string } | null;
  media?: { id: string; isCover: boolean }[];
};
export function catalogView(item: PublicListing): CatalogView {
  const images = item.media?.map((media) => "/api/v1/media/" + media.id) || [];
  return { id: item.slug, mode: item.availabilityStatus === "sold" ? "terjual" : item.saleMode === "auction" ? "lelang" : "langsung", title: item.title, type: item.type, city: [item.location?.city, item.location?.province].filter(Boolean).join(", "), land: item.landAreaM2, build: item.buildingAreaM2, beds: item.bedroomCount, price: item.askingPrice, desc: item.description, imageUrls: images, imageUrl: images[0], createdAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : undefined, auctionEndsAt: item.auctionEndsAt ? new Date(item.auctionEndsAt).toISOString() : null };
}
