"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { ContactDetails } from "@/lib/contact";
import { formatRupiah } from "@/lib/currency";
import { propertyTypes } from "@/lib/properties";
import { catalogView, type CatalogView as Property, type PublicListing } from "@/lib/catalog-view";
import { ApiClientError, apiRequest } from "@/components/api-client";
import { csrfHeaders } from "@/components/csrf";

function money(value: number) { return formatRupiah(value); }
function remaining(end: number, now: number) { const diff = end - now; if (diff <= 0) return "Lelang berakhir"; const hours = Math.floor(diff / 3600000); const minutes = Math.floor((diff % 3600000) / 60000); return hours >= 24 ? `${Math.floor(hours / 24)} hari ${hours % 24} jam` : `${hours} jam ${minutes} menit`; }
type CatalogResponse = { items: PublicListing[]; nextCursor: string | null };
type Density = "large" | "medium" | "small";
const densityKey = "catalog-grid-density";
// Pola sama dengan PropertyActions di halaman detail: dengar event storage (tab lain) plus event kustom
// (tab yang sama, karena storage tidak menyala untuk penulisnya sendiri).
function subscribeDensity(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("catalog-density", listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener("catalog-density", listener); };
}
function readDensity(): Density { try { const value = localStorage.getItem(densityKey); return value === "medium" || value === "small" ? value : "large"; } catch { return "large"; } }
function writeDensity(value: Density) { try { localStorage.setItem(densityKey, value); window.dispatchEvent(new Event("catalog-density")); } catch { /* penyimpanan diblokir: pilihan berlaku untuk sesi ini saja */ } }

function CardIcon({ name, filled = false }: { name: "share" | "like"; filled?: boolean }) {
  const paths = {
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4m-6.8 7 6.8 4" /></>,
    like: <path d="M12 20.3 4.3 12.8a4.6 4.6 0 0 1 0-6.6 4.8 4.8 0 0 1 6.7 0l1 1 1-1a4.8 4.8 0 0 1 6.7 0 4.6 4.6 0 0 1 0 6.6Z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function PropertyIcon({ type }: { type: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (type === "Tanah") return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="m7 34 10-9 8 6 9-12 8 15M8 39h32M11 20l6-6 5 5" /></svg>;
  if (type === "Apartemen" || type === "Ruko" || type === "Gudang") return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="M11 40V9h26v31M7 40h34M17 16h5m5 0h5m-15 7h5m5 0h5m-15 7h5m5 0h5M21 40v-6h6v6" /></svg>;
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path {...common} d="m6 23 18-15 18 15M11 20v20h26V20M20 40V28h8v12M15 23h5m8 0h5" /></svg>;
}

function CatalogHome({ contact }: { contact: ContactDetails }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [catalogProperties, setCatalogProperties] = useState<Property[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const query = (searchParams.get("q") || "").slice(0, 100);
  const type = propertyTypes.includes(searchParams.get("type") || "") ? searchParams.get("type")! : "";
  const price = ["low", "mid", "high", "premium"].includes(searchParams.get("price") || "") ? searchParams.get("price")! : "";
  const mode = ["lelang", "langsung"].includes(searchParams.get("mode") || "") ? searchParams.get("mode")! : "";
  const sort = ["terbaru", "harga-asc", "harga-desc", "berakhir"].includes(searchParams.get("sort") || "") ? searchParams.get("sort")! : "terbaru";
  function updateFilter(key: string, value: string, replace = false) {
    const parameters = new URLSearchParams(window.location.search);
    if (value) parameters.set(key, value); else parameters.delete(key);
    parameters.delete("cursor");
    const target = "/" + (parameters.size ? "?" + parameters : "") + window.location.hash;
    if (replace) router.replace(target, { scroll: false }); else router.push(target, { scroll: false });
  }
  const setQuery = (value: string) => updateFilter("q", value, true);
  const setType = (value: string) => updateFilter("type", value);
  const setPrice = (value: string) => updateFilter("price", value);
  const setMode = (value: string) => updateFilter("mode", value);
  const setSort = (value: string) => updateFilter("sort", value);
  const [menuOpen, setMenuOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => { const controller = new AbortController(); fetch("/api/v1/auth/session", { cache: "no-store", signal: controller.signal }).then((response) => response.json()).then((body: { data?: { authenticated?: boolean } }) => setAuthenticated(body.data?.authenticated === true)).catch(() => undefined); return () => controller.abort(); }, []);
  const [notice, setNotice] = useState("");
  // Server snapshot konstan "large" supaya markup awal cocok dengan hasil render server (hindari mismatch hydration).
  const density = useSyncExternalStore<Density>(subscribeDensity, readDensity, () => "large");
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [likeBusy, setLikeBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    // Akun staf tanpa peran buyer mendapat 403 di sini; diabaikan diam-diam, pesannya muncul saat tombol ditekan.
    apiRequest<{ propertyId: string }[]>("/api/v1/watchlist", { cache: "no-store", signal: controller.signal })
      .then((items) => { if (!controller.signal.aborted) setWatchlist(new Set(items.map((item) => item.propertyId))); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [authenticated]);
  async function toggleLike(propertyId: string) {
    if (!authenticated) { router.push("/login"); return; }
    if (likeBusy) return;
    const liked = watchlist.has(propertyId);
    setLikeBusy(propertyId);
    try {
      await apiRequest("/api/v1/watchlist", { method: liked ? "DELETE" : "POST", headers: { "Content-Type": "application/json", ...await csrfHeaders() }, body: JSON.stringify({ propertyId }) });
      setWatchlist((current) => { const next = new Set(current); if (liked) next.delete(propertyId); else next.add(propertyId); return next; });
      setNotice(liked ? "Properti dihapus dari daftar simpanan." : "Properti disimpan ke akun Anda.");
    } catch (error) {
      setNotice(error instanceof ApiClientError && error.code === "FORBIDDEN" ? "Simpan properti hanya tersedia untuk akun pembeli." : "Gagal memperbarui simpanan. Coba lagi.");
    } finally { setLikeBusy(null); }
  }
  async function shareProperty(item: Property) {
    const url = window.location.origin + "/properti/" + item.id;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else { await navigator.clipboard.writeText(url); setNotice("Tautan properti disalin."); }
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setNotice("Gagal membagikan. Salin alamat properti dari browser."); }
  }
  const requestController = useRef<AbortController | null>(null);
  const moreLock = useRef(false);
  const [loadedKey, setLoadedKey] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [startedAt] = useState(0);
  const [now, setNow] = useState(startedAt);
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
  };

  const catalogParameters = useCallback((cursor?: string) => {
    const parameters = new URLSearchParams({ limit: "24" });
    if (query.trim()) parameters.set("q", query.trim());
    if (type) parameters.set("type", type);
    if (mode) parameters.set("saleMode", mode === "lelang" ? "auction" : "direct_sale");
    if (price === "low") parameters.set("maxPrice", "499999999");
    if (price === "mid") { parameters.set("minPrice", "500000000"); parameters.set("maxPrice", "1000000000"); }
    if (price === "high") { parameters.set("minPrice", "1000000000"); parameters.set("maxPrice", "3000000000"); }
    if (price === "premium") parameters.set("minPrice", "3000000000");
    parameters.set("sort", sort === "harga-asc" ? "price_asc" : sort === "harga-desc" ? "price_desc" : sort === "berakhir" ? "deadline" : "newest");
    if (cursor) parameters.set("cursor", cursor);
    return parameters;
  }, [mode, price, query, sort, type]);

  const parametersKey = catalogParameters().toString();
  const pending = loading || loadedKey !== parametersKey;

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setCatalogError("");
      apiRequest<CatalogResponse>("/api/v1/properties?" + catalogParameters(), { cache: "no-store", signal: controller.signal })
        .then((data) => { if (!controller.signal.aborted) { setCatalogProperties(data.items.map(catalogView)); setNextCursor(data.nextCursor); setLoadedKey(parametersKey); } })
        .catch(() => { if (!controller.signal.aborted) { setCatalogProperties([]); setNextCursor(null); setLoadedKey(parametersKey); setCatalogError("Katalog belum dapat dimuat. Coba lagi."); } })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [catalogParameters, parametersKey, retryCount]);

  async function loadMore() {
    const controller = requestController.current;
    if (!nextCursor || pending || moreLock.current || !controller || controller.signal.aborted) return;
    moreLock.current = true;
    setLoadingMore(true);
    try {
      const data = await apiRequest<CatalogResponse>("/api/v1/properties?" + catalogParameters(nextCursor), { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      setCatalogProperties((current) => Array.from(new Map([...current, ...data.items.map(catalogView)].map((item) => [item.id, item])).values()));
      setNextCursor(data.nextCursor);
    } catch { if (!controller.signal.aborted) setNotice("Properti berikutnya belum dapat dimuat. Coba lagi."); }
    finally { moreLock.current = false; setLoadingMore(false); }
  }
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  return <>
    <header className="site-header home-header">
      <a className="brand" href="#top" aria-label="Lelangan Properti — Beranda"><Image className="brand-logo" src="/image/logo/white/LP-logo-large-white.png" alt="Lelangan Properti" width={1944} height={809} sizes="(max-width: 720px) 140px, 165px" priority /></a>
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Buka menu" aria-expanded={menuOpen}>☰</button>
      <nav className={menuOpen ? "nav open" : "nav"} aria-label="Navigasi utama">
        <button type="button" onClick={() => scrollToSection("properti")}>Cari Properti</button><button type="button" onClick={() => scrollToSection("cara-kerja")}>Cara Kerja</button><button type="button" onClick={() => scrollToSection("jual")}>Jual Properti</button><button type="button" onClick={() => scrollToSection("kontak")}>Kontak</button><a href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Login"}</a>
      </nav>
      <a className="button gold" href={authenticated ? "/dashboard" : "/login"}>{authenticated ? "Dashboard" : "Login"}</a>
    </header>

    <main id="top">
      <section className="hero">
        <div className="hero-layout">
          <div className="hero-copy">
            <span className="eyebrow">KATALOG LELANG & JUAL BELI PROPERTI</span>
            <h1>Cara cepat menemukan penawaran terbaik untuk properti Anda</h1>
            <p>LelanganProperti.my.id mempertemukan pemilik aset dan calon pembeli secara terbuka, cepat, dan kompetitif. Pemilik tetap menentukan transaksi yang disetujui.</p>
            <div className="hero-actions"><a className="button gold" href="#properti">Jelajahi katalog</a><a className="button hero-secondary" href="#jual">Pasarkan properti</a></div>
            <p className="hero-disclaimer">Katalog mencakup aset pribadi, perusahaan, bank, dan lembaga yang dipasarkan resmi—bukan jual, beli, sewa aset sitaan atau properti bermasalah.</p>
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
          <label><span>Kata kunci properti</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Rumah 2 lantai..." /></label>
          <label><span>Jenis properti</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="">Semua jenis</option>{propertyTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Rentang harga</span><select value={price} onChange={(event) => setPrice(event.target.value)}><option value="">Semua harga</option><option value="low">Di bawah Rp 500 jt</option><option value="mid">Rp 500 jt – 1 M</option><option value="high">Rp 1 M – 3 M</option><option value="premium">Di atas Rp 3 M</option></select></label>
          <a className="button dark" href="#properti">Cari Properti</a>
        </div>
        <div className="stats"><div><strong>LELANG</strong><span>pemasaran kompetitif</span></div><div><strong>JUAL</strong><span>penawaran langsung</span></div><div><strong>TERPILIH</strong><span>aset yang telah ditinjau</span></div><div><strong>TERBUKA</strong><span>informasi aset pendukung</span></div></div>
      </section>

      <section className="property-section" id="properti">
        {/* Dua kontrol untuk satu state `type`: chip dipakai di desktop, dropdown menggantikannya di ponsel
            (tujuh chip di layar sempit membungkus jadi tiga baris). Hanya satu yang tampil per breakpoint. */}
        <div className="chips" aria-label="Filter jenis properti"><button className={!type ? "active" : ""} onClick={() => setType("")}>Semua</button>{propertyTypes.map((item) => <button className={type === item ? "active" : ""} onClick={() => setType(item)} key={item}>{item}</button>)}</div>
        <div className="listing-toolbar"><label className="sort type-sort">Jenis <select value={type} onChange={(event) => setType(event.target.value)}><option value="">Semua jenis</option>{propertyTypes.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><div className="tabs"><button className={!mode ? "active" : ""} onClick={() => setMode("")}>Semua</button><button className={mode === "lelang" ? "active" : ""} onClick={() => setMode("lelang")}>Lelang</button><button className={mode === "langsung" ? "active" : ""} onClick={() => setMode("langsung")}>Jual Langsung</button></div><label className="sort">Urutkan <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="terbaru">Terbaru</option><option value="harga-asc">Harga terendah</option><option value="harga-desc">Harga tertinggi</option><option value="berakhir">Segera berakhir</option></select></label><label className="sort density-sort">Tampilan <select value={density} onChange={(event) => writeDensity(event.target.value as Density)}><option value="large">Besar (3 kolom)</option><option value="medium">Sedang (4 kolom)</option><option value="small">Kecil (5 kolom)</option></select></label></div>
        <p className="result-count" aria-live="polite">{pending ? "Memuat properti…" : `Menampilkan ${catalogProperties.length} properti yang dimuat`}</p>
        {catalogError && !pending && <div className="empty" role="alert"><p>{catalogError}</p><button type="button" className="button dark" onClick={() => { setLoading(true); setRetryCount((count) => count + 1); }}>Coba lagi</button></div>}
        {!pending && catalogProperties.length ? <><div className="property-grid" data-density={density}>{catalogProperties.map((item) => {
          const end = item.auctionEndsAt ? Date.parse(item.auctionEndsAt) : startedAt;
          const liked = watchlist.has(item.propertyId);
          // Link dibentangkan menutupi kartu (bukan membungkusnya) supaya tombol share/like tidak bersarang di dalam anchor.
          return <article className="property-card" key={item.id}>
            <Link className="property-card-link" href={`/properti/${item.id}`} aria-label={`Lihat detail ${item.title}`} />
            <div className={`property-visual type-${item.type.toLowerCase()}${(item.imageUrls?.[0] || item.imageUrl) ? " has-image" : ""}`} style={(item.imageUrls?.[0] || item.imageUrl) ? { backgroundImage: `url(${item.imageUrls?.[0] || item.imageUrl})` } : undefined}><span className={`badge ${item.mode}`}>{item.mode === "lelang" ? "Lelang Aktif" : item.mode === "langsung" ? "Jual Langsung" : "Terjual"}</span><PropertyIcon type={item.type} /><small>{item.type}</small></div>
            <div className="property-body"><span className="location">⌖ {item.city}</span><h2>{item.title}</h2><div className="meta">{item.land > 0 && <span>LT {item.land} m²</span>}{item.build > 0 && <span>LB {item.build} m²</span>}{item.beds > 0 && <span>{item.beds} KT</span>}</div><div className="price-row"><div><small>{item.mode === "lelang" ? "Harga acuan" : "Harga"}</small><strong>{money(item.price)}</strong></div>{item.mode === "lelang" && <time dateTime={item.auctionEndsAt || undefined}>{item.auctionEndsAt ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(end)) + " WIB" : "Jadwal belum tersedia"}{now > 0 && item.auctionEndsAt && <><br />{remaining(end, now)}</>}</time>}</div><div className="card-actions"><button type="button" className="card-icon-btn" aria-label={`Bagikan ${item.title}`} title="Bagikan" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void shareProperty(item); }}><CardIcon name="share" /></button><button type="button" className={liked ? "card-icon-btn active" : "card-icon-btn"} aria-pressed={liked} aria-label={liked ? `Hapus ${item.title} dari simpanan` : `Simpan ${item.title}`} title={liked ? "Hapus dari simpanan" : "Simpan"} disabled={likeBusy === item.propertyId} onClick={(event) => { event.preventDefault(); event.stopPropagation(); void toggleLike(item.propertyId); }}><CardIcon name="like" filled={liked} /></button></div></div>
          </article>;
        })}</div>{nextCursor && <div className="catalog-more"><button type="button" className="button dark" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Memuat…" : "Muat lebih banyak"}</button></div>}</> : !pending && !catalogError && <div className="empty"><h2>Belum ada properti yang cocok</h2><p>Ubah kata kunci atau filter pencarian.</p></div>}
      </section>

      <section className="how" id="cara-kerja"><div className="section-heading"><span className="eyebrow dark-text">PROSES TERSTRUKTUR</span><h2>Dari pencarian properti hingga tindak lanjut</h2><p>Platform ini menyediakan katalog dan pengiriman minat, bukan sistem bidding atau pembayaran.</p></div><div className="steps">{[["01", "Cari properti", "Gunakan filter jenis, harga, dan mode pemasaran."], ["02", "Pelajari detail", "Tinjau informasi properti dan jadwal yang tercantum."], ["03", "Kirim minat", "Isi formulir pada detail properti agar staf dapat menghubungi Anda."], ["04", "Tindak lanjut", "Bahas informasi dan proses berikutnya dengan staf di luar platform."]].map(([number, title, text]) => <div className="step" key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></div>)}</div></section>
      <section className="seller" id="jual"><div><span className="eyebrow">UNTUK PEMILIK ASET</span><h2>Punya properti untuk dijual atau dilelang?</h2><p>Masuk ke dashboard untuk membuat draft, menambahkan foto, dan mengirim properti ke proses review.</p></div><Link className="button light" href="/dashboard/properties">Daftarkan Properti</Link></section>
    </main>

    <footer id="kontak" className="home-footer"><div><Image src="/image/logo/color/LP-logo-large-color.png" alt="Lelang Properti" width={1944} height={809} className="footer-logo" /><p>Platform pencarian dan transaksi properti dengan proses transparan.</p></div><div><b>Jelajahi</b><a href="#properti">Cari Properti</a><a href="#cara-kerja">Cara Kerja</a></div><div><b>Kontak</b><a href={"mailto:" + contact.email}>{contact.email}</a><a href={"tel:" + contact.phoneHref}>{contact.phoneLabel}</a><Link href="/kebijakan-privasi">Kebijakan Privasi</Link><Link href="/syarat-dan-ketentuan">Syarat dan Ketentuan</Link></div><small>© 2026 Lelang Properti</small></footer>

    {notice && <div className="demo-notice" role="status">{notice}<button aria-label="Tutup pemberitahuan" onClick={() => setNotice("")}>×</button></div>}
  </>;
}

export default function HomeView({ contact }: { contact: ContactDetails }) {
  return <Suspense fallback={<main><p role="status">Memuat katalog…</p></main>}><CatalogHome contact={contact} /></Suspense>;
}