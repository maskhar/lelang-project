import Link from "next/link";
import PropertySiteChrome from "./property-site-chrome";
import { notFound } from "next/navigation";
import { formatExactRupiah, formatRupiah } from "@/lib/currency";
import { publicListing } from "@/server/properties/service";
import { catalog } from "@/server/properties/catalog";
import { catalogView } from "@/lib/catalog-view";
import { AuthHttpError } from "@/server/auth/http";
import LeadForm from "@/components/lead-form";
import styles from "./property-detail.module.css";
import PropertyHeroGallery from "./property-hero-gallery";
import PropertyAmenities from "./property-amenities";
import PropertyActions from "./property-actions";

export const dynamic = "force-dynamic";

function statusLabel(mode: string) {
  if (mode === "lelang") return "Lelang aktif";
  if (mode === "terjual") return "Terjual";
  return "Jual langsung";
}

export default async function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let listing;
  try { listing = await publicListing(id); }
  catch (error) { if (error instanceof AuthHttpError && error.status === 404) notFound(); throw error; }
  const property = catalogView(listing);
  const images = property.imageUrls?.length ? property.imageUrls : property.imageUrl ? [property.imageUrl] : [];
  const offer = property.mode === "lelang" ? property.bid ?? property.price : property.price;
  const recordedDate = property.createdAt ? new Date(property.createdAt) : null;
  const dateLabel = recordedDate && !Number.isNaN(recordedDate.getTime()) ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(recordedDate) + " WIB" : "Belum tersedia";
  const specifications = [["Luas tanah", property.land > 0 ? property.land.toLocaleString("id-ID") + " m²" : "Belum tersedia"], ["Luas bangunan", property.build > 0 ? property.build.toLocaleString("id-ID") + " m²" : "Belum tersedia"], ["Kamar tidur", property.beds > 0 ? String(property.beds) : "Belum tersedia"], ["Kamar mandi", "Belum tersedia"], ["Carport", "Belum tersedia"], ["Dokumen", "Belum tersedia"], ["Jumlah lantai", "Belum tersedia"], ["Daya listrik", "Belum tersedia"], ["Jenis aset", property.type]];
  const recommendations = (await catalog(new URLSearchParams({ type: property.type, limit: "4" }))).items.map(catalogView)
    .filter((item) => item.id !== property.id)
    .sort((left, right) => {
      const leftScore = Number(left.type === property.type) * 2 + Number(left.city === property.city);
      const rightScore = Number(right.type === property.type) * 2 + Number(right.city === property.city);
      return rightScore - leftScore || right.id.localeCompare(left.id);
    })
    .slice(0, 3);

  return <PropertySiteChrome><main className={styles.page}>
    <div className={styles.breadcrumb}>Katalog properti <span>/</span> {property.type} <span>/</span> {listing.sku}</div>
    <div className={styles.detailLayout}><div className={styles.detailMain}>
    <section className={styles.hero}>
      <PropertyHeroGallery images={images} title={property.title} />

    </section>
    <div className={styles.publicationInfo}><span>Dipublikasikan: {dateLabel}</span><span>Dikelola tim aplikasi</span></div>
    <section className={styles.content}><article><section className={styles.descriptionCard} aria-labelledby="description-title"><h2 id="description-title">Deskripsi Aset</h2><p>{property.desc || "Deskripsi belum tersedia."}</p></section><section className={styles.specificationCard} aria-labelledby="specification-title"><h2 id="specification-title">Spesifikasi Aset</h2><dl className={styles.assetSpecs}>{specifications.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className={styles.locationMap} aria-labelledby="location-map-title"><div><span>LOKASI ASET</span><h2 id="location-map-title">Peta lokasi</h2><p>{property.city}</p></div><iframe title={`Peta lokasi ${property.title}`} src={`https://www.google.com/maps?q=${encodeURIComponent(property.city)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></section><PropertyAmenities /></article><aside className={styles.verification}><span>INFORMASI PENTING</span><h2>Periksa aset sebelum transaksi</h2><p>Pelajari dokumen, status kepemilikan, kondisi fisik, serta ketentuan penawaran sebelum mengambil keputusan.</p><ul><li>Atur jadwal pengecekan lokasi</li><li>Verifikasi dokumen dan legalitas</li><li>Pastikan detail transaksi disepakati para pihak</li></ul></aside></section>
    <section className={styles.contact} id="hubungi"><div><span>TERTARIK DENGAN PROPERTI INI?</span><h2>Kirim minat kepada pengelola</h2><p>Form ini bukan bidding atau pembayaran. Harga acuan dan jadwal lelang harus dikonfirmasi kepada pengelola.</p>{listing.availabilityStatus === "available" ? <LeadForm propertyId={listing.id} /> : <p>Properti sudah terjual.</p>}</div><Link className="button light" href="/#properti">Kembali ke katalog</Link></section>
    </div><aside className={styles.sidebar}>
      <div className={styles.summary}><span className={property.mode === "lelang" ? styles.lelang : property.mode === "terjual" ? styles.terjual : styles.langsung}>{statusLabel(property.mode)}</span><p className={styles.location}>⌖ {property.city}</p><h1>{property.title}</h1><p className={styles.type}>{property.type}</p><p className={styles.sku}>SKU {listing.sku}</p><div className={styles.priceBox}><span>{property.mode === "lelang" ? "Harga acuan" : "Harga penawaran"}</span><strong>{formatRupiah(offer)}</strong><small>{formatExactRupiah(offer)}</small></div><a className="button dark wide" href="#hubungi">{property.mode === "lelang" ? "Kirim minat" : property.mode === "terjual" ? "Lihat properti serupa" : "Hubungi pemilik"}</a><PropertyActions id={property.id} title={property.title} /></div>
    </aside></div>
    {recommendations.length > 0 && <section className={styles.recommendations} aria-labelledby="recommendation-title"><div className={styles.recommendationHeading}><div><span>ASET PILIHAN LAINNYA</span><h2 id="recommendation-title">Rekomendasi aset untuk Anda</h2><p>Jelajahi properti serupa berdasarkan jenis aset dan lokasi.</p></div><Link href="/#properti">Lihat semua aset →</Link></div><div className={styles.recommendationGrid}>{recommendations.map((item) => {const image = item.imageUrls?.[0] || item.imageUrl; const itemOffer = item.mode === "lelang" ? item.bid ?? item.price : item.price; return <Link href={`/properti/${item.id}`} className={styles.recommendationCard} key={item.id}><div className={styles.recommendationImage} style={image ? {backgroundImage:`url(${image})`} : undefined}><span className={item.mode === "lelang" ? styles.lelang : item.mode === "terjual" ? styles.terjual : styles.langsung}>{statusLabel(item.mode)}</span>{!image && <b>{item.type}</b>}</div><div className={styles.recommendationBody}><p>⌖ {item.city}</p><h3>{item.title}</h3><div className={styles.recommendationMeta}>{item.land > 0 && <span>LT {item.land.toLocaleString("id-ID")} m²</span>}{item.build > 0 && <span>LB {item.build.toLocaleString("id-ID")} m²</span>}{item.beds > 0 && <span>{item.beds} KT</span>}</div><small>{item.mode === "lelang" ? "Penawaran tertinggi" : "Harga"}</small><strong>{formatRupiah(itemOffer)}</strong></div></Link>})}</div></section>}
  </main></PropertySiteChrome>;
}
