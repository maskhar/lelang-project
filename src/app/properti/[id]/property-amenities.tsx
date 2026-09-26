"use client";

import { useMemo, useState } from "react";
import styles from "./property-detail.module.css";
import AmenityIconGlyph from "@/components/amenity-icon";
import { amenityByKey, amenityCategories, type AmenityCategory } from "@/lib/amenities";

type Category = "Semua" | AmenityCategory;

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
