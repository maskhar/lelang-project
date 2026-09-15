"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { propertyTypes } from "@/lib/properties";
import { formatRupiah } from "@/lib/currency";
import { indonesianCities, cityProvinceByName } from "@/lib/indonesia-cities";
import styles from "./dashboard.module.css";
import ListingReview from "@/components/listing-review";

type StaffProperty = { id: string; slug: string; saleMode: "auction" | "direct_sale"; publicationStatus: string; availabilityStatus: string; type: string; askingPrice: number; version: number; title: string; location: { city: string; province: string } | null };
type ApiError = { error?: { message?: string } };

async function responseData<T>(response: Response): Promise<T> {
  const body = await response.json() as T & ApiError;
  if (!response.ok) throw new Error(body.error?.message || "Permintaan gagal.");
  return body;
}

export default function Dashboard() {
  const [properties, setProperties] = useState<StaffProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"direct_sale" | "auction">("direct_sale");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const province = cityProvinceByName.get(city.trim().toLocaleLowerCase("id-ID")) || "";

  async function csrf() {
    const response = await fetch("/api/v1/auth/csrf", { cache: "no-store" });
    if (!response.ok) throw new Error("Sesi tidak tersedia. Login kembali.");
    const token = response.headers.get("x-csrf-token");
    if (!token) throw new Error("Token CSRF tidak tersedia.");
    return token;
  }

  async function load() {
    setLoading(true);
    try {
      const body = await responseData<{ data: StaffProperty[] }>(await fetch("/api/v1/admin/properties", { cache: "no-store" }));
      setProperties(body.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal memuat properti."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/admin/properties", { cache: "no-store", signal: controller.signal })
      .then((response) => responseData<{ data: StaffProperty[] }>(response))
      .then((body) => setProperties(body.data))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Gagal memuat properti."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); }, [previewUrls]);

  function selectImages(input: FileList | File[]) {
    const files = Array.from(input);
    if (files.length > 20 || files.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError("Maksimal 20 foto JPG, PNG, atau WebP; tiap foto maksimal 5 MB."); return; }
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages(files); setPreviewUrls(files.map((file) => URL.createObjectURL(file))); setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !province) { if (!province) setError("Pilih kota/kabupaten dari daftar."); return; }
    const formElement = event.currentTarget;
    setSaving(true); setError(""); setMessage("");
    try {
      const form = new FormData(formElement);
      const startsAt = mode === "auction" ? new Date(String(form.get("auctionStartsAt"))).toISOString() : null;
      const endsAt = mode === "auction" ? new Date(String(form.get("auctionEndsAt"))).toISOString() : null;
      const token = await csrf();
      const created = await responseData<{ data: { property: { id: string; version: number } } }>(await fetch("/api/v1/properties", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": token }, body: JSON.stringify({ title: form.get("title"), description: form.get("description"), type: form.get("type"), city, province, saleMode: mode, askingPrice: Number(form.get("askingPrice")), landAreaM2: Number(form.get("landAreaM2") || 0), buildingAreaM2: Number(form.get("buildingAreaM2") || 0), bedroomCount: Number(form.get("bedroomCount") || 0), auctionStartsAt: startsAt, auctionEndsAt: endsAt }) }));
      let version = created.data.property.version;
      for (const file of selectedImages) {
        const media = new FormData(); media.set("file", file); media.set("version", String(version));
        const uploaded = await responseData<{ data: { version: number } }>(await fetch("/api/v1/properties/" + created.data.property.id + "/media", { method: "POST", headers: { "X-CSRF-Token": await csrf() }, body: media }));
        version = uploaded.data.version;
      }
      await responseData(await fetch("/api/v1/properties/" + created.data.property.id, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrf() }, body: JSON.stringify({ version, action: "submit" }) }));
      formElement.reset(); setMode("direct_sale"); setCity(""); setPrice(""); setSelectedImages([]); setPreviewUrls([]);
      setMessage("Draft berhasil dibuat, foto masuk verifikasi, dan revisi dikirim untuk review.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Gagal menyimpan properti."); }
    finally { setSaving(false); }
  }

  return <main className={styles.dashboard}>
    <header className={styles.header}><div><span className="eyebrow dark-text">LELANG PROPERTI / DASHBOARD</span><h1>Kelola properti</h1><p>PostgreSQL, review terkontrol, media karantina.</p></div><div><Link href="/account" className="button light">Akun</Link> <Link href="/#properti" className="button dark">Katalog</Link></div></header>
    <p className={styles.warning}>Semua perubahan memerlukan sesi Google dan policy server. Properti baru tidak langsung tampil publik.</p>
    <div className={styles.stats}><div><strong>{loading ? "—" : properties.length}</strong><span>Total listing</span></div><div><strong>{loading ? "—" : properties.filter((item) => item.publicationStatus === "pending_review").length}</strong><span>Menunggu review</span></div><div><strong>PostgreSQL</strong><span>Sumber data backend</span></div></div>
    <div className={styles.columns}><section className={styles.panel}><h2>Tambah draft</h2><p>Foto diverifikasi worker sebelum listing dapat dipublikasikan.</p>
      <form onSubmit={submit} className={styles.form}><fieldset disabled={saving}>
        <label className={styles.full}>Nama properti<input name="title" required minLength={5} maxLength={120} /></label>
        <label>Kota/kabupaten<input value={city} onChange={(event) => setCity(event.target.value)} list="indonesia-cities" required /><datalist id="indonesia-cities">{indonesianCities.map((item) => <option key={item.city} value={item.city}>{item.province}</option>)}</datalist></label>
        <label>Provinsi<input value={province} readOnly /></label>
        <label>Jenis<select name="type">{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Mode<select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="direct_sale">Jual langsung</option><option value="auction">Lelang</option></select></label>
        <label>Harga (Rp)<input name="askingPrice" type="number" required min="1" value={price} onChange={(event) => setPrice(event.target.value)} /><small>{formatRupiah(Number(price))}</small></label>
        <label>Kamar tidur<input name="bedroomCount" type="number" min="0" defaultValue="0" /></label>
        <label>Luas tanah (m²)<input name="landAreaM2" type="number" min="0" defaultValue="0" /></label>
        <label>Luas bangunan (m²)<input name="buildingAreaM2" type="number" min="0" defaultValue="0" /></label>
        {mode === "auction" && <><label>Mulai lelang<input name="auctionStartsAt" type="datetime-local" required /></label><label>Selesai lelang<input name="auctionEndsAt" type="datetime-local" required /></label></>}
        <label className={styles.full}>Deskripsi<textarea name="description" required minLength={20} maxLength={4000} /></label>
        <div className={styles.full}><input ref={imageInputRef} className={styles.fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImages(event.target.files || [])} /><div className={isDraggingImages ? styles.dropzoneActive + " " + styles.dropzone : styles.dropzone} role="button" tabIndex={0} onClick={() => imageInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") imageInputRef.current?.click(); }} onDragOver={(event) => { event.preventDefault(); setIsDraggingImages(true); }} onDragLeave={() => setIsDraggingImages(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingImages(false); selectImages(event.dataTransfer.files); }}><strong>Tambah foto properti</strong><span>Klik atau tarik file</span><small>{selectedImages.length}/20 foto</small></div></div>
        {previewUrls.length > 0 && <div className={styles.gallery}>{previewUrls.map((url, index) => <div key={url} className={styles.preview} style={{ backgroundImage: "url(" + url + ")" }}><span>{index === 0 ? "Sampul" : index + 1}</span></div>)}</div>}
      </fieldset>{error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.success}>{message}</p>}<button className="button dark wide" disabled={saving}>{saving ? "Menyimpan…" : "Simpan & kirim review"}</button></form>
    </section><section className={styles.panel}><h2>Listing terbaru</h2>{loading ? <p>Memuat…</p> : <div className={styles.list}>{properties.map((item) => <article key={item.id} className={styles.item}><div><span className={styles.tag}>{item.publicationStatus.replaceAll("_", " ")} · v{item.version}</span><h3>{item.title}</h3><p>{item.location?.city}, {item.location?.province} · {item.type}</p><strong>{formatRupiah(item.askingPrice)}</strong><ListingReview id={item.id} version={item.version} onChanged={load} /></div></article>)}</div>}</section></div>
  </main>;
}
