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
import { buildWhatsappLink } from "@/lib/contact";
import { getContactDetails } from "@/server/contact";
import { parseAuthOrigin } from "@/server/env";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const listing = await publicListing(id);
    const image = listing.media.find((item) => item.isCover) || listing.media[0];
    const description = listing.description.slice(0, 155);
    return { title: listing.title + " · " + listing.sku, description, openGraph: { title: listing.title, description, type: "website", images: image ? [{ url: "/api/v1/media/" + image.id }] : undefined } };
  } catch (error) {
    if (error instanceof AuthHttpError && error.status === 404) return { title: "Properti tidak ditemukan", robots: { index: false, follow: false } };
    throw error;
  }
}

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
  const mapQuery = listing.location?.latitude != null && listing.location?.longitude != null ? `${listing.location.latitude},${listing.location.longitude}` : listing.location?.address || property.city;
  const mapLabel = listing.location?.address || property.city;
  const propertyUrl = new URL("/properti/" + property.id, parseAuthOrigin(process.env.APP_BASE_URL).origin).toString();
  // Satu sumber nomor untuk tombol WhatsApp DAN footer di PropertySiteChrome, supaya keduanya tidak
  // bisa menunjuk nomor berbeda ketika WHATSAPP_NUMBER diubah.
  const contact = getContactDetails();
  const whatsappHref = buildWhatsappLink({ whatsappNumber: contact.whatsappNumber, title: property.title, price: formatRupiah(offer), address: mapLabel, mapsUrl: `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}`, propertyUrl });
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

  return <PropertySiteChrome contact={contact}><main className={styles.page}>
    <div className={styles.breadcrumb}>Katalog properti <span>/</span> {property.type} <span>/</span> {listing.sku}</div>
    <div className={styles.detailLayout}><div className={styles.detailMain}>
    <section className={styles.hero}>
      <PropertyHeroGallery images={images} title={property.title} />

    </section>
    <div className={styles.publicationInfo}><span>Dipublikasikan: {dateLabel}</span><span>Dikelola tim aplikasi</span></div>
    <section className={styles.content}><article><section className={styles.descriptionCard} aria-labelledby="description-title"><h2 id="description-title">Deskripsi Aset</h2><p>{property.desc || "Deskripsi belum tersedia."}</p></section><section className={styles.specificationCard} aria-labelledby="specification-title"><h2 id="specification-title">Spesifikasi Aset</h2><dl className={styles.assetSpecs}>{specifications.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className={styles.locationMap} aria-labelledby="location-map-title"><div><span>LOKASI ASET</span><h2 id="location-map-title">Peta lokasi</h2><p>{mapLabel}</p></div><iframe title={`Peta lokasi ${property.title}`} src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /></section><PropertyAmenities selected={listing.amenities ?? []} /></article><aside className={styles.verification}><span>INFORMASI PENTING</span><h2>Periksa aset sebelum transaksi</h2><p>Pelajari dokumen, status kepemilikan, kondisi fisik, serta ketentuan penawaran sebelum mengambil keputusan.</p><ul><li>Atur jadwal pengecekan lokasi</li><li>Verifikasi dokumen dan legalitas</li><li>Pastikan detail transaksi disepakati para pihak</li></ul></aside></section>
    <section className={styles.contact} id="hubungi"><div><span>TERTARIK DENGAN PROPERTI INI?</span><h2>Kirim minat kepada pengelola</h2><p>Form ini bukan bidding atau pembayaran. Harga acuan dan jadwal lelang harus dikonfirmasi kepada pengelola.</p>{listing.availabilityStatus === "available" ? <LeadForm propertyId={listing.id} /> : <p>Properti sudah terjual.</p>}</div><Link className="button light" href="/#properti">Kembali ke katalog</Link></section>
    </div><aside className={styles.sidebar}>
      <div className={styles.summary}><span className={property.mode === "lelang" ? styles.lelang : property.mode === "terjual" ? styles.terjual : styles.langsung}>{statusLabel(property.mode)}</span><p className={styles.location}>⌖ {property.city}</p><h1>{property.title}</h1><p className={styles.type}>{property.type}</p><p className={styles.sku}>SKU {listing.sku}</p><div className={styles.priceBox}><span>{property.mode === "lelang" ? "Harga acuan" : "Harga penawaran"}</span><strong>{formatRupiah(offer)}</strong><small>{formatExactRupiah(offer)}</small></div><div className={styles.contactRow}><a className="button dark wide" href="#hubungi">{property.mode === "lelang" ? "Kirim minat" : property.mode === "terjual" ? "Lihat properti serupa" : "Hubungi pemilik"}</a><a className={`button wide ${styles.whatsapp}`} href={whatsappHref} target="_blank" rel="noopener noreferrer" aria-label={`Tanya lewat WhatsApp tentang ${property.title}`}><svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.02h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.03-.2-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.21.88 2.39 1.01 2.55.12.17 1.74 2.65 4.21 3.72.59.25 1.05.4 1.4.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" /></svg>WhatsApp</a></div><PropertyActions id={property.id} title={property.title} /></div>
    </aside></div>
    {recommendations.length > 0 && <section className={styles.recommendations} aria-labelledby="recommendation-title"><div className={styles.recommendationHeading}><div><span>ASET PILIHAN LAINNYA</span><h2 id="recommendation-title">Rekomendasi aset untuk Anda</h2><p>Jelajahi properti serupa berdasarkan jenis aset dan lokasi.</p></div><Link href="/#properti">Lihat semua aset →</Link></div><div className={styles.recommendationGrid}>{recommendations.map((item) => {const image = item.imageUrls?.[0] || item.imageUrl; const itemOffer = item.mode === "lelang" ? item.bid ?? item.price : item.price; return <Link href={`/properti/${item.id}`} className={styles.recommendationCard} key={item.id}><div className={styles.recommendationImage} style={image ? {backgroundImage:`url(${image})`} : undefined}><span className={item.mode === "lelang" ? styles.lelang : item.mode === "terjual" ? styles.terjual : styles.langsung}>{statusLabel(item.mode)}</span>{!image && <b>{item.type}</b>}</div><div className={styles.recommendationBody}><p>⌖ {item.city}</p><h3>{item.title}</h3><div className={styles.recommendationMeta}>{item.land > 0 && <span>LT {item.land.toLocaleString("id-ID")} m²</span>}{item.build > 0 && <span>LB {item.build.toLocaleString("id-ID")} m²</span>}{item.beds > 0 && <span>{item.beds} KT</span>}</div><small>{item.mode === "lelang" ? "Penawaran tertinggi" : "Harga"}</small><strong>{formatRupiah(itemOffer)}</strong></div></Link>})}</div></section>}
  </main></PropertySiteChrome>;
}
