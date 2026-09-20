"use client";

import { useMemo, useState } from "react";
import styles from "./property-detail.module.css";
import { amenityByKey, amenityCategories, type AmenityCategory, type AmenityIcon } from "@/lib/amenities";

type Category = "Semua" | AmenityCategory;

function AmenityIconGlyph({ name }: { name: AmenityIcon }) {
  const paths = {
    plane: <path d="m3 13 7-2 3-7 2 1-1 7 7 3-1 2-7-1-3 5-2-1 1-5-5-1Z" />,
    train: <><rect x="5" y="3" width="14" height="13" rx="4" /><path d="M5 13h14M8 21l-2-3m10 3 2-3M9 8h6" /></>,
    bus: <><rect x="3" y="6" width="18" height="11" rx="2" /><path d="M3 13h18M7 17v2m10-2v2" /><circle cx="7.5" cy="17.5" r="0.1" /><circle cx="16.5" cy="17.5" r="0.1" /></>,
    road: <><path d="M8 3 4 21m8-18 4 18M12 6v2m0 4v2m0 4v2" /></>,
    transit: <><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 10h16M9 20l-2-4m10 4 2-4" /></>,
    school: <><path d="m2 9 10-5 10 5-10 5-10-5Z" /><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" /></>,
    hospital: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 7v8M8 11h8" /></>,
    pharmacy: <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>,
    market: <><path d="M4 8h16l-1.5 11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2L4 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
    bank: <><path d="M3 9h18M5 9v10m5-10v10m5-10v10m5-10v10M3 19h18M2 22h20M12 2l9 5H3l9-5Z" /></>,
    restaurant: <><path d="M6 2v8m-3-8v5a3 3 0 0 0 6 0V2M18 2c-2 0-3 2-3 5v4h2v11m1-20c2 0 3 2 3 5v4h-2v11" /></>,
    cinema: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="m3 9 4-4m3 0 4 4m3-4 4 4M3 16l4 4m3 0 4-4m3 4 4-4" /></>,
    park: <><path d="M12 2 6 12h3l-4 6h4v4h6v-4h4l-4-6h3L12 2Z" /></>,
    home: <><path d="m3 11 9-8 9 8v10H3V11Z" /><path d="M9 21v-6h6v6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function PropertyAmenities({ selected }: { selected: string[] }) {
  const [category, setCategory] = useState<Category>("Semua");
  const items = useMemo(() => selected.map((key) => amenityByKey.get(key)).filter((item): item is NonNullable<typeof item> => Boolean(item)), [selected]);
  const availableCategories = useMemo(() => amenityCategories.filter((cat) => items.some((item) => item.category === cat)), [items]);
  const visible = useMemo(() => category === "Semua" ? items : items.filter((item) => item.category === category), [items, category]);

  if (items.length === 0) return <section className={styles.amenities} aria-labelledby="amenities-title"><h2 id="amenities-title">Akses &amp; Fasilitas</h2><p className={styles.amenityNote}>Informasi akses dan fasilitas belum diisi untuk aset ini.</p></section>;

  return <section className={styles.amenities} aria-labelledby="amenities-title">
    <h2 id="amenities-title">Akses &amp; Fasilitas</h2>
    {availableCategories.length > 1 && <div className={styles.amenityTabs} role="tablist" aria-label="Filter akses dan fasilitas">{(["Semua", ...availableCategories] as Category[]).map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>}
    <div className={styles.amenityGrid}>{visible.map((item) => <div className={styles.amenityItem} key={item.key}><span><AmenityIconGlyph name={item.icon} />{item.label}</span><b>Tersedia</b></div>)}</div>
    <p className={styles.amenityNote}>Data akses dan fasilitas diisi oleh pengelola aset.</p>
  </section>;
}
