"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatRupiah } from "@/lib/currency";
import { propertyTypes, seedProperties, type Property } from "@/lib/properties";

function money(value: number) { return formatRupiah(value); }
function remaining(end: number, now: number) { const diff = end - now; if (diff <= 0) return "Lelang berakhir"; const hours = Math.floor(diff / 3600000); const minutes = Math.floor((diff % 3600000) / 60000); return hours >= 24 ? `${Math.floor(hours / 24)} hari ${hours % 24} jam` : `${hours} jam ${minutes} menit`; }

function PropertyIcon({ type }: { type: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "Tanah") return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="m7 34 10-9 8 6 9-12 8 15M8 39h32M11 20l6-6 5 5" /></svg>;
  if (type === "Apartemen" || type === "Ruko" || type === "Gudang") return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="M11 40V9h26v31M7 40h34M17 16h5m5 0h5m-15 7h5m5 0h5m-15 7h5m5 0h5M21 40v-6h6v6" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="m6 23 18-15 18 15M11 20v20h26V20M20 40V28h8v12M15 23h5m8 0h5" /></svg>;
}

export default function Home() {
  const [catalogProperties, setCatalogProperties] = useState<Property[]>(seedProperties);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState("");
  const [sort, setSort] = useState("terbaru");
  const [selected, setSelected] = useState<Property | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const galleryImages = selected?.imageUrls?.length ? selected.imageUrls : selected?.imageUrl ? [selected.imageUrl] : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const modalRef = useRef<HTMLElement>(null);
  const [startedAt] = useState(Date.parse("2026-09-14T00:00:00Z"));
  const [now, setNow] = useState(startedAt);
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/properties", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Gagal memuat data.")))
      .then((data) => setCatalogProperties(data.properties))
      .catch(() => { if (!controller.signal.aborted) setNotice("Data server gagal dimuat. Katalog sementara menampilkan data awal; muat ulang untuk mencoba lagi."); });
    return () => controller.abort();
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!selected) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "Tab") {
        const buttons = modalRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const normalized = query.toLowerCase();
    const result = catalogProperties.filter((item) => {
      const displayPrice = item.mode === "lelang" ? item.bid ?? item.price : item.price;
      if (mode && item.mode !== mode) return false;
      if (type && item.type !== type) return false;
      if (normalized && ![item.title, item.city, item.type].some((value) => value.toLowerCase().includes(normalized))) return false;
      if (price === "low" && displayPrice >= 500_000_000) return false;
      if (price === "mid" && (displayPrice < 500_000_000 || displayPrice > 1_000_000_000)) return false;
      if (price === "high" && (displayPrice < 1_000_000_000 || displayPrice > 3_000_000_000)) return false;
      if (price === "premium" && displayPrice < 3_000_000_000) return false;
      return true;
    });
    return result.sort((a, b) => sort === "harga-asc" ? (a.bid ?? a.price) - (b.bid ?? b.price) : sort === "harga-desc" ? (b.bid ?? b.price) - (a.bid ?? a.price) : sort === "berakhir" ? (a.duration ?? 9999) - (b.duration ?? 9999) : b.id - a.id);
  }, [catalogProperties, mode, price, query, sort, type]);

  return <>
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Lelangan Properti — Beranda"><Image className="brand-logo" src="/image/logo/white/LP-logo-large-white.png" alt="Lelangan Properti" width={1944} height={809} sizes="(max-width: 720px) 140px, 165px" priority /></a>
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Buka menu" aria-expanded={menuOpen}>☰</button>
      <nav className={menuOpen ? "nav open" : "nav"} aria-label="Navigasi utama">
        <button type="button" onClick={() => scrollToSection("properti")}>Cari Properti</button><button type="button" onClick={() => scrollToSection("cara-kerja")}>Cara Kerja</button><button type="button" onClick={() => scrollToSection("jual")}>Jual Properti</button><button type="button" onClick={() => scrollToSection("kontak")}>Kontak</button><a href="/dashboard">Dashboard</a>
      </nav>
      <a className="button gold" href="/dashboard">Dashboard</a>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-layout">
          <div className="hero-copy">
            <span className="eyebrow">KATALOG LELANG & JUAL BELI PROPERTI</span>
            <h1>Cara cepat menemukan penawaran terbaik untuk properti Anda</h1>
            <p>LelanganProperti.my.id mempertemukan pemilik aset dan calon pembeli secara terbuka, cepat, dan kompetitif. Pemilik tetap menentukan transaksi yang disetujui.</p>
            <div className="hero-actions"><a className="button gold" href="#properti">Jelajahi katalog</a><a className="button hero-secondary" href="#jual">Pasarkan properti</a></div>
            <p className="hero-disclaimer">Katalog mencakup aset pribadi, perusahaan, bank, dan lembaga yang dipasarkan resmi—bukan hanya aset sitaan atau properti bermasalah.</p>
            <p className="hero-tagline">Jual lebih cepat. Dapatkan penawaran terbaik. Temukan properti yang tepat.</p>
          </div>
          <aside className="hero-summary" aria-label="Informasi layanan">
            <span className="hero-summary-label">CEPAT PROSESNYA, KOMPETITIF PENAWARANNYA</span>
            <h2>Penawaran terbaik, keputusan tetap di tangan pemilik.</h2>
            <p>Calon pembeli mempelajari aset dan mengajukan penawaran. Pemilik mempertimbangkan harga serta kecepatan transaksi sesuai kesepakatan.</p>
            <ul><li>Lokasi, luas tanah, dan luas bangunan</li><li>Harga pembukaan atau harga penawaran</li><li>Legalitas, kondisi fisik, foto, dan dokumen</li><li>Mekanisme penawaran yang jelas</li></ul>
            <div className="coverage"><b>Wilayah utama Jawa Timur</b><span>Malang · Batu · Kediri · Nganjuk · Surabaya · Mojokerto · Jombang · Pasuruan · Probolinggo · Situbondo</span></div>
            <p className="hero-transaction-note">Transaksi berdasarkan kesepakatan para pihak, pemeriksaan dokumen, verifikasi legalitas, serta ketentuan yang berlaku.</p>
          </aside>
        </div>
        <div className="search-panel" role="search" aria-label="Cari properti">
          <label><span>Lokasi atau kata kunci</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Malang, rumah 2 lantai..." /></label>
          <label><span>Jenis properti</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Semua jenis</option>{propertyTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Rentang harga</span><select value={price} onChange={(event) => setPrice(event.target.value)}><option value="">Semua harga</option><option value="low">Di bawah Rp 500 jt</option><option value="mid">Rp 500 jt – 1 M</option><option value="high">Rp 1 M – 3 M</option><option value="premium">Di atas Rp 3 M</option></select></label>
          <a className="button dark" href="#properti">Cari Properti</a>
        </div>
        <div className="stats"><div><strong>{catalogProperties.filter((item) => item.mode !== "terjual").length}</strong><span>properti aktif</span></div><div><strong>{new Set(catalogProperties.map((item) => item.city.split(",")[0])).size}</strong><span>kota di Indonesia</span></div><div><strong>{catalogProperties.filter((item) => item.mode === "lelang").length}</strong><span>lelang berjalan</span></div><div><strong>TERBUKA</strong><span>informasi aset pendukung</span></div></div>
      </section>

      <section className="property-section" id="properti">
        <div className="chips" aria-label="Filter jenis properti"><button className={!type ? "active" : ""} onClick={() => setType("")}>Semua</button>{propertyTypes.map((item) => <button className={type === item ? "active" : ""} onClick={() => setType(item)} key={item}>{item}</button>)}</div>
        <div className="listing-toolbar"><div className="tabs"><button className={!mode ? "active" : ""} onClick={() => setMode("")}>Semua</button><button className={mode === "lelang" ? "active" : ""} onClick={() => setMode("lelang")}>Lelang</button><button className={mode === "langsung" ? "active" : ""} onClick={() => setMode("langsung")}>Jual Langsung</button></div><label className="sort">Urutkan <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="terbaru">Terbaru</option><option value="harga-asc">Harga terendah</option><option value="harga-desc">Harga tertinggi</option><option value="berakhir">Segera berakhir</option></select></label></div>
        <p className="result-count">Menampilkan {filtered.length} properti</p>
        {filtered.length ? <div className="property-grid">{filtered.map((item) => {
          const end = (item.createdAt ? Date.parse(item.createdAt) : startedAt) + (item.duration ?? 0) * 3600000;
          return <Link className="property-card" href={`/properti/${item.id}`} key={item.id}>
            <div className={`property-visual type-${item.type.toLowerCase()}${(item.imageUrls?.[0] || item.imageUrl) ? " has-image" : ""}`} style={(item.imageUrls?.[0] || item.imageUrl) ? { backgroundImage: `url(${item.imageUrls?.[0] || item.imageUrl})` } : undefined}><span className={`badge ${item.mode}`}>{item.mode === "lelang" ? "Lelang Aktif" : item.mode === "langsung" ? "Jual Langsung" : "Terjual"}</span><PropertyIcon type={item.type} /><small>{item.type}</small></div>
            <div className="property-body"><span className="location">⌖ {item.city}</span><h2>{item.title}</h2><div className="meta">{item.land > 0 && <span>LT {item.land} m²</span>}{item.build > 0 && <span>LB {item.build} m²</span>}{item.beds > 0 && <span>{item.beds} KT</span>}</div><div className="price-row"><div><small>{item.mode === "lelang" ? "Penawaran tertinggi" : "Harga"}</small><strong>{money(item.mode === "lelang" ? item.bid ?? item.price : item.price)}</strong></div>{item.mode === "lelang" && <time>{remaining(end, now)}</time>}</div><span className="card-button">{item.mode === "lelang" ? "Ikuti Lelang" : "Lihat Detail"}</span></div>
          </Link>;
        })}</div> : <div className="empty"><h2>Belum ada properti yang cocok</h2><p>Ubah kata kunci atau filter pencarian.</p></div>}
      </section>

      <section className="how" id="cara-kerja"><div className="section-heading"><span className="eyebrow dark-text">PROSES TERSTRUKTUR</span><h2>Cara kerja lelang, dari daftar sampai serah terima</h2><p>Setiap langkah tercatat sehingga penawar dan penjual mengetahui posisi transaksi.</p></div><div className="steps">{[["01", "Daftar & verifikasi", "Buat akun dan lengkapi identitas sebagai peserta lelang."], ["02", "Pilih & tawar", "Tinjau dokumen lalu ajukan penawaran sebelum waktu berakhir."], ["03", "Menangkan lelang", "Penawar tertinggi dihubungi tim untuk konfirmasi resmi."], ["04", "Pembayaran", "Selesaikan pembayaran dan terima dokumen kepemilikan."]].map(([number, title, text]) => <div className="step" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
      <section className="seller" id="jual"><div><span className="eyebrow">UNTUK PEMILIK ASET</span><h2>Punya properti untuk dijual atau dilelang?</h2><p>Daftarkan aset dan jangkau pencari properti yang siap menawar.</p></div><button className="button light" onClick={() => setNotice("Mode prototype: pendaftaran aset belum tersedia. Tidak ada data yang dikirim.")}>Daftarkan Properti</button></section>
    </main>

    <footer id="kontak"><div><Image src="/image/logo/color/LP-logo-large-color.png" alt="Lelang Properti" width={1944} height={809} className="footer-logo" /><p>Platform pencarian dan transaksi properti dengan proses transparan.</p></div><div><b>Jelajahi</b><a href="#properti">Cari Properti</a><a href="#cara-kerja">Cara Kerja</a></div><div><b>Kontak</b><a href="mailto:halo@lelangproperti.id">halo@lelangproperti.id</a><a href="tel:+6281200000000">+62 812-0000-0000</a><Link href="/kebijakan-privasi">Kebijakan Privasi</Link></div><small>© 2026 Lelang Properti</small></footer>

    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Tutup detail">×</button><div className={`modal-visual type-${selected.type.toLowerCase()}${galleryImages[activePhoto] ? " has-image" : ""}`} style={galleryImages[activePhoto] ? { backgroundImage: `url(${galleryImages[activePhoto]})` } : undefined}><PropertyIcon type={selected.type} /></div>{galleryImages.length > 1 && <div className="gallery-thumbnails" aria-label="Galeri foto properti">{galleryImages.map((url, index) => <button key={url} type="button" aria-label={`Lihat foto ${index + 1}`} aria-pressed={activePhoto === index} onClick={() => setActivePhoto(index)} style={{ backgroundImage: `url(${url})` }}><span>{index + 1}</span></button>)}</div>}<div className="modal-content"><span className="location">⌖ {selected.city}</span><h2 id="modal-title">{selected.title}</h2><div className="modal-meta">{selected.land > 0 && <div><strong>{selected.land} m²</strong><span>Luas tanah</span></div>}{selected.build > 0 && <div><strong>{selected.build} m²</strong><span>Luas bangunan</span></div>}<div><strong>{selected.type}</strong><span>Jenis properti</span></div></div><p>{selected.desc}</p><div className="modal-price"><div><small>{selected.mode === "lelang" ? `Penawaran tertinggi · ${selected.bidders} penawar` : "Harga"}</small><strong>{money(selected.mode === "lelang" ? selected.bid ?? selected.price : selected.price)}</strong></div></div><button className="button dark wide" onClick={() => { setSelected(null); setNotice("Mode prototype: transaksi belum tersedia. Tidak ada penawaran atau pembayaran yang dikirim."); }}>{selected.mode === "lelang" ? "Ajukan Penawaran" : selected.mode === "terjual" ? "Informasi Properti Terjual" : "Hubungi Penjual"}</button></div></section></div>}
    {notice && <div className="demo-notice" role="status">{notice}<button aria-label="Tutup pemberitahuan" onClick={() => setNotice("")}>×</button></div>}
  </>;
}
