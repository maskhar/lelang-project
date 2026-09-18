"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { propertyTypes } from "@/lib/properties";
import { indonesianCities, cityProvinceByName } from "@/lib/indonesia-cities";
import { listingInput } from "@/server/properties/validation";
import type { z } from "zod";
import { FormError } from "./form-error";
import styles from "@/app/dashboard/dashboard.module.css";

export type ListingFormValue = z.infer<typeof listingInput>;
export function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

const coordinatePattern = /^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/;

export default function PropertyForm({ initial, onSave, disabled = false, statusActions }: { initial?: ListingFormValue; onSave: (value: ListingFormValue) => Promise<void>; disabled?: boolean; statusActions?: ReactNode }) {
  const [city, setCity] = useState(initial?.city || "");
  const [mode, setMode] = useState(initial?.saleMode || "direct_sale");
  const [coordinates, setCoordinates] = useState(initial?.latitude != null && initial?.longitude != null ? `${initial.latitude}, ${initial.longitude}` : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const province = cityProvinceByName.get(city.trim().toLocaleLowerCase("id-ID")) || "";
  const coordinateMatch = coordinatePattern.exec(coordinates.trim());
  const mapQuery = coordinateMatch ? `${coordinateMatch[1]},${coordinateMatch[2]}` : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving || disabled) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true); setError(null);
    try {
      const rawSku = String(fields.get("sku") || "").trim();
      const coordinateValue = String(fields.get("coordinates") || "").trim();
      const parsedCoordinates = coordinatePattern.exec(coordinateValue);
      if (coordinateValue && !parsedCoordinates) throw new Error("Koordinat harus memakai format latitude, longitude.");
      const latitude = parsedCoordinates ? Number(parsedCoordinates[1]) : null;
      const longitude = parsedCoordinates ? Number(parsedCoordinates[2]) : null;
      const value = listingInput.parse({ sku: rawSku || undefined, title: fields.get("title"), description: fields.get("description"), type: fields.get("type"), city: city.trim(), province, address: String(fields.get("address") || "").trim(), latitude, longitude, saleMode: mode, askingPrice: Number(fields.get("askingPrice")), landAreaM2: Number(fields.get("landAreaM2")), buildingAreaM2: Number(fields.get("buildingAreaM2")), bedroomCount: Number(fields.get("bedroomCount")), auctionStartsAt: mode === "auction" ? new Date(String(fields.get("auctionStartsAt"))).toISOString() : null, auctionEndsAt: mode === "auction" ? new Date(String(fields.get("auctionEndsAt"))).toISOString() : null });
      await onSave(value);
    } catch (reason) { setError(reason); }
    finally { setSaving(false); }
  }

  // statusActions sits outside the disabled fieldset: the content lock must not grey out admin review decisions.
  return <form className={styles.form} onSubmit={submit}>{statusActions && <aside className={styles.statusEditor}><strong>Status &amp; review</strong>{statusActions}</aside>}<fieldset disabled={saving || disabled}>
    <label>SKU produk<input name="sku" pattern="LP-[A-Za-z0-9]{6,32}" maxLength={35} defaultValue={initial?.sku} placeholder="Kosongkan untuk otomatis" aria-describedby="sku-help" /></label><p id="sku-help" className={styles.full}>Format manual: LP- diikuti 6–32 huruf atau angka. Kosongkan saat membuat properti untuk generate otomatis.</p>
    <label className={styles.full}>Judul<input name="title" required minLength={5} maxLength={120} defaultValue={initial?.title} /></label>
    <label>Kota/kabupaten<input value={city} onChange={(event) => setCity(event.target.value)} list="editor-cities" required /><datalist id="editor-cities">{indonesianCities.map((item) => <option value={item.city} key={item.city}>{item.province}</option>)}</datalist></label>
    <label>Provinsi<input value={province} readOnly /></label>
    <label className={styles.full}>Alamat lengkap<input name="address" required minLength={5} maxLength={500} defaultValue={initial?.address} placeholder="Jalan, nomor, kelurahan, kecamatan" /></label>
    <label className={styles.full}>Koordinat Google Maps<input name="coordinates" value={coordinates} onChange={(event) => setCoordinates(event.target.value)} placeholder="-7.950523746336057, 112.63716997594375" inputMode="decimal" /></label>
    <p className={styles.full + " " + styles.fieldHint}>Salin koordinat dari <a href="https://maps.google.com" target="_blank" rel="noreferrer">Google Maps</a> dalam format latitude, longitude. Nilai akan dipisahkan otomatis saat disimpan.</p>
    <div className={styles.mapPreview + " " + styles.full}>{mapQuery ? <iframe title="Preview titik lokasi" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <p>Tempel koordinat untuk menampilkan preview peta.</p>}</div>
    <label>Jenis<select name="type" defaultValue={initial?.type}>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as ListingFormValue["saleMode"])}><option value="direct_sale">Jual langsung</option><option value="auction">Informasi lelang</option></select></label>
    <label>Harga rupiah<input name="askingPrice" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required defaultValue={initial?.askingPrice} /></label>
    <label>Kamar tidur<input name="bedroomCount" type="number" min={0} max={1000} step={1} required defaultValue={initial?.bedroomCount ?? 0} /></label>
    <label>Luas tanah (m²)<input name="landAreaM2" type="number" min={0} max={1000000000} step={1} required defaultValue={initial?.landAreaM2 ?? 0} /></label>
    <label>Luas bangunan (m²)<input name="buildingAreaM2" type="number" min={0} max={1000000000} step={1} required defaultValue={initial?.buildingAreaM2 ?? 0} /></label>
    {mode === "auction" && <><label>Mulai (zona waktu perangkat)<input name="auctionStartsAt" type="datetime-local" required defaultValue={localDateTime(initial?.auctionStartsAt ?? null)} /></label><label>Selesai (zona waktu perangkat)<input name="auctionEndsAt" type="datetime-local" required defaultValue={localDateTime(initial?.auctionEndsAt ?? null)} /></label></>}
    <label className={styles.full}>Deskripsi<textarea name="description" required minLength={20} maxLength={4000} defaultValue={initial?.description} /></label>
  </fieldset><FormError error={error} /><button className="button dark" disabled={saving || disabled}>{saving ? "Menyimpan…" : "Simpan draft"}</button></form>;
}