"use client";

import { useMemo, useState } from "react";
import styles from "./property-detail.module.css";

type Category = "Semua" | "Akses" | "Fasilitas";
type Amenity = { label: string; category: Exclude<Category, "Semua">; icon: "plane" | "bank" | "drink" | "cinema" | "pharmacy" | "home" };

const amenities: Amenity[] = [
  { label: "Bandara", category: "Akses", icon: "plane" },
  { label: "Bank/ATM", category: "Akses", icon: "bank" },
  { label: "Bar", category: "Fasilitas", icon: "drink" },
  { label: "Bioskop", category: "Fasilitas", icon: "cinema" },
  { label: "Farmasi", category: "Fasilitas", icon: "pharmacy" },
  { label: "Furnished", category: "Fasilitas", icon: "home" },
];

function AmenityIcon({ name }: { name: Amenity["icon"] }) {
  const paths = {
    plane: <path d="m3 13 7-2 3-7 2 1-1 7 7 3-1 2-7-1-3 5-2-1 1-5-5-1Z" />,
    bank: <><path d="M3 9h18M5 9v10m5-10v10m5-10v10m5-10v10M3 19h18M2 22h20M12 2l9 5H3l9-5Z" /></>,
    drink: <><path d="M7 3h10l-1 8a4 4 0 0 1-8 0L7 3Z" /><path d="M12 15v6m-4 0h8" /></>,
    cinema: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="m3 9 4-4m3 0 4 4m3-4 4 4M3 16l4 4m3 0 4-4m3 4 4-4" /></>,
    pharmacy: <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>,
    home: <><path d="m3 11 9-8 9 8v10H3V11Z" /><path d="M9 21v-6h6v6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function PropertyAmenities() {
  const [category, setCategory] = useState<Category>("Semua");
  const visible = useMemo(() => category === "Semua" ? amenities : amenities.filter((item) => item.category === category), [category]);
  return <section className={styles.amenities} aria-labelledby="amenities-title"><h2 id="amenities-title">Akses &amp; Fasilitas</h2><div className={styles.amenityTabs} role="tablist" aria-label="Filter akses dan fasilitas">{(["Semua", "Akses", "Fasilitas"] as Category[]).map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div><div className={styles.amenityGrid}>{visible.map((item) => <div className={styles.amenityItem} key={item.label}><span><AmenityIcon name={item.icon} />{item.label}</span><b>Belum tersedia</b></div>)}</div><p className={styles.amenityNote}>Informasi akses dan fasilitas akan diperbarui setelah verifikasi aset.</p></section>;
}
