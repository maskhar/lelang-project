"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { propertyTypes, type Property } from "@/lib/properties";
import { formatRupiah, formatExactRupiah } from "@/lib/currency";
import { indonesianCities, cityProvinceByName } from "@/lib/indonesia-cities";
import styles from "./dashboard.module.css";

export default function Dashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("langsung");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [city, setCity] = useState("");
  const [price, setPrice] = useState("");
  const province = cityProvinceByName.get(city.trim().toLocaleLowerCase("id-ID")) || "";

  useEffect(() => () => { previewUrls.forEach((url) => URL.revokeObjectURL(url)); }, [previewUrls]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/properties", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Gagal memuat properti. Muat ulang halaman untuk mencoba lagi."); return response.json(); })
      .then((data) => setProperties(data.properties))
      .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function selectImages(filesInput: FileList | File[]) {
    if (saving) return;
    const files = Array.from(filesInput);
    if (files.length > 20 || files.some((file) => file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
      setError("Maksimal 20 foto JPG, PNG, atau WebP; tiap foto maksimal 5 MB.");
      return;
    }
    setError("");
    setSelectedImages(files);
    setPreviewUrls(files.map((file) => URL.createObjectURL(file)));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    if (!province) { setError("Pilih kota/kabupaten dari daftar agar provinsi terisi."); return; }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData(form);
      formData.delete("images");
      selectedImages.forEach((image) => formData.append("images", image));
      const response = await fetch("/api/properties", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan properti.");
      setProperties((current) => [data.property, ...current]);
      form.reset();
      setMode("langsung");
      setPreviewUrls([]);
      setSelectedImages([]);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setCity("");
      setPrice("");
      setMessage("Properti berhasil disimpan dan langsung tampil di katalog.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Koneksi gagal. Data formulir tetap tersimpan di halaman ini.");
    } finally {
      setSaving(false);
    }
  }

  return <main className={styles.dashboard}>
    <header className={styles.header}><div><span className="eyebrow dark-text">LELANG PROPERTI / ADMIN</span><h1>Kelola properti</h1><p>Tambah aset baru, simpan lokal, tampilkan di katalog.</p></div><Link href="/#properti" className="button dark">Cari & lihat katalog</Link></header>
    <p className={styles.warning}>Prototype lokal, belum memakai autentikasi. Jangan jalankan di jaringan publik. Data dan foto tersimpan di komputer server ini.</p>
    <div className={styles.stats}><div><strong>{loading ? "—" : properties.length}</strong><span>Total properti</span></div><div><strong>{loading ? "—" : properties.filter((property) => property.mode === "lelang").length}</strong><span>Aset lelang</span></div><div><strong>SQLite</strong><span>Penyimpanan lokal</span></div></div>
    <div className={styles.columns}>
      <section className={styles.panel}><h2>Tambah properti</h2><p>Masukkan nominal rupiah asli. Contoh: 6000000000 tampil sebagai Rp 6 M.</p>
        <form onSubmit={submit} className={styles.form}>
          <fieldset disabled={saving}>
            <label className={styles.full}>Nama properti<input name="title" required maxLength={120} placeholder="Rumah 2 lantai di Malang" /></label>
            <label>Kota / kabupaten<input name="city" value={city} onChange={(event) => setCity(event.target.value)} list="indonesia-cities" required maxLength={100} placeholder="Ketik nama kota..." autoComplete="off" /><datalist id="indonesia-cities">{indonesianCities.map((item) => <option key={item.city} value={item.city}>{item.province}</option>)}</datalist></label>
            <label>Provinsi<input name="province" value={province} readOnly placeholder="Otomatis dari kota" /><small>Pilih kota dari saran yang tersedia.</small></label>
            <label>Jenis<select name="type">{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Status<select name="mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="langsung">Jual Langsung</option><option value="lelang">Lelang</option><option value="terjual">Terjual</option></select></label>
            <label>Nilai properti (Rp)<input name="price" type="number" required min="1" max="9007199254740991" step="1" placeholder="6000000000" value={price} onChange={(event) => setPrice(event.target.value)} /><small aria-live="polite">{formatRupiah(Number(price))} · {formatExactRupiah(Number(price))}</small></label>
            <label>Kamar tidur<input name="beds" type="number" min="0" max="1000" defaultValue="0" /></label>
            <label>Luas tanah (m²)<input name="land" type="number" min="0" max="1000000000" defaultValue="0" /></label>
            <label>Luas bangunan (m²)<input name="build" type="number" min="0" max="1000000000" defaultValue="0" /></label>
            {mode === "lelang" && <><label>Penawaran awal (Rp)<input name="bid" type="number" min="0" max="9007199254740991" placeholder="Opsional, mengikuti harga" /></label><label>Durasi lelang (jam)<input name="duration" type="number" required min="1" max="8760" defaultValue="72" /></label></>}
            <label className={styles.full}>Deskripsi<textarea name="desc" required maxLength={1000} rows={4} placeholder="Kondisi, lokasi, fasilitas, dan informasi aset..." /></label>
            <div className={styles.full}>
              <input ref={imageInputRef} className={styles.fileInput} name="images" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => selectImages(event.target.files || [])} />
              <div className={isDraggingImages ? styles.dropzoneActive + " " + styles.dropzone : styles.dropzone} role="button" tabIndex={saving ? -1 : 0} aria-disabled={saving} aria-label="Tambah foto properti dengan klik atau tarik dan lepas" onClick={() => { if (!saving) imageInputRef.current?.click(); }} onKeyDown={(event) => { if (!saving && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); imageInputRef.current?.click(); } }} onDragEnter={(event) => { event.preventDefault(); if (!saving) setIsDraggingImages(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setIsDraggingImages(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDraggingImages(false); }} onDrop={(event) => { event.preventDefault(); setIsDraggingImages(false); selectImages(event.dataTransfer.files); }}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
                <strong>Tarik dan lepas foto di sini</strong><span>atau klik untuk memilih file</span><small>{selectedImages.length}/20 foto · JPG, PNG, WebP · maksimal 5 MB per foto</small>
              </div>
            </div>
            {previewUrls.length > 0 && <div className={styles.gallery}>{previewUrls.map((url, index) => <div key={url} className={styles.preview} style={{ backgroundImage: "url(" + url + ")" }} role="img" aria-label={"Pratinjau foto " + (index + 1)}><span>{index === 0 ? "Sampul" : index + 1}</span></div>)}</div>}
          </fieldset>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {message && <p role="status" className={styles.success}>{message}</p>}
          <button className="button dark wide" disabled={saving}>{saving ? "Menyimpan…" : "Simpan & tampilkan properti"}</button>
        </form>
      </section>
      <section className={styles.panel}><h2>Daftar properti</h2><p>16 properti awal tetap tersedia. Properti baru muncul paling atas.</p>
        {loading ? <p role="status">Memuat properti…</p> : <div className={styles.list}>{properties.map((property) => <article key={property.id} className={styles.item}><div><span className={styles.tag}>{property.mode === "lelang" ? "Lelang" : property.mode === "terjual" ? "Terjual" : "Jual Langsung"} · #{property.id}</span><h3>{property.title}</h3><p>{property.city} · {property.type}</p><strong title={formatExactRupiah(property.price)}>{formatRupiah(property.price)}</strong><p>{formatExactRupiah(property.price)}</p></div>{property.imageUrl && <span className={styles.photo} style={{ backgroundImage: "url(" + property.imageUrl + ")" }} role="img" aria-label={property.title} />}</article>)}</div>}
      </section>
    </div>
  </main>;
}
