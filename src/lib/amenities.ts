// Katalog tetap akses & fasilitas. Dipakai server (validasi listingInput) dan client (form editor +
// halaman publik), jadi tanpa "server-only" — pola sama dengan propertyTypes di properties.ts.
// `key` adalah nilai yang tersimpan di app.property_revisions.amenities; label boleh diubah tanpa migrasi.
export type AmenityCategory = "Akses" | "Fasilitas";
export type AmenityIcon = "plane" | "train" | "bus" | "road" | "transit" | "school" | "hospital" | "pharmacy" | "market" | "bank" | "restaurant" | "cinema" | "park" | "home";
export type AmenityItem = { key: string; label: string; category: AmenityCategory; icon: AmenityIcon };

export const amenityCatalog = [
  { key: "bandara", label: "Bandara", category: "Akses", icon: "plane" },
  { key: "stasiun", label: "Stasiun kereta", category: "Akses", icon: "train" },
  { key: "terminal", label: "Terminal bus", category: "Akses", icon: "bus" },
  { key: "tol", label: "Gerbang tol", category: "Akses", icon: "road" },
  { key: "transportasi", label: "Halte/angkutan", category: "Akses", icon: "transit" },
  { key: "sekolah", label: "Sekolah", category: "Fasilitas", icon: "school" },
  { key: "rumah_sakit", label: "RS/Klinik", category: "Fasilitas", icon: "hospital" },
  { key: "farmasi", label: "Farmasi", category: "Fasilitas", icon: "pharmacy" },
  { key: "pasar", label: "Pasar/Mall", category: "Fasilitas", icon: "market" },
  { key: "bank", label: "Bank/ATM", category: "Fasilitas", icon: "bank" },
  { key: "restoran", label: "Restoran/kafe", category: "Fasilitas", icon: "restaurant" },
  { key: "bioskop", label: "Bioskop", category: "Fasilitas", icon: "cinema" },
  { key: "taman", label: "Taman/RTH", category: "Fasilitas", icon: "park" },
  { key: "furnished", label: "Furnished", category: "Fasilitas", icon: "home" },
] as const satisfies readonly AmenityItem[];

export type AmenityKey = (typeof amenityCatalog)[number]["key"];
export const amenityCategories: AmenityCategory[] = ["Akses", "Fasilitas"];
export const amenityKeys = amenityCatalog.map((item) => item.key) as [AmenityKey, ...AmenityKey[]];
export const amenityByKey = new Map<string, AmenityItem>(amenityCatalog.map((item) => [item.key, item]));
// Urutkan sesuai katalog dan buang duplikat/kunci tak dikenal, supaya urutan tampil publik selalu sama.
export const orderAmenities = (values: readonly string[]) => amenityCatalog.filter((item) => values.includes(item.key)).map((item) => item.key);
