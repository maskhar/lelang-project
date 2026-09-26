import Image from "next/image";
import { notFound } from "next/navigation";
import { formatExactRupiah, formatRupiah } from "@/lib/currency";
import { publicListing } from "@/server/properties/service";
import { catalogView } from "@/lib/catalog-view";
import { AuthHttpError } from "@/server/auth/http";
import { amenityByKey, orderAmenities } from "@/lib/amenities";
import AmenityIconGlyph from "@/components/amenity-icon";
import { getContactDetails } from "@/server/contact";
import { parseAuthOrigin } from "@/server/env";
import BrosurActions from "./brosur-actions";
import styles from "./brosur.module.css";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

// Brosur adalah turunan cetak dari halaman detail, bukan halaman tersendiri di mata mesin pencari.
// Tanpa noindex, /brosur dan /properti/[id] bersaing untuk kata kunci yang sama.
export const metadata: Metadata = { robots: { index: false, follow: false } };

function statusLabel(mode: string) {
  if (mode === "lelang") return "Lelang aktif";
  if (mode === "terjual") return "Terjual";
  return "Jual langsung";
}

export default async function PropertyBrochure({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const { id } = await params;
  const { print } = await searchParams;
  let listing;
  try { listing = await publicListing(id); }
  catch (error) { if (error instanceof AuthHttpError && error.status === 404) notFound(); throw error; }

  const property = catalogView(listing);
  const images = property.imageUrls ?? [];
  const offer = property.price;
  const contact = getContactDetails();
  const origin = parseAuthOrigin(process.env.APP_BASE_URL).origin;
  const detailPath = "/properti/" + property.id;
  const propertyUrl = new URL(detailPath, origin).toString();
  const address = listing.location?.address || property.city || "Belum tersedia";
  const publishedAt = listing.publishedAt ? new Date(listing.publishedAt) : null;
  const publishedLabel = publishedAt && !Number.isNaN(publishedAt.getTime())
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(publishedAt)
    : "Belum tersedia";
  // Tanggal cetak ikut dicantumkan karena harga dan ketersediaan bisa berubah: lembar yang beredar harus
  // bisa dinilai umurnya tanpa membuka situs.
  const printedLabel = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date());

  // orderAmenities dipakai, bukan urutan tersimpan, supaya dua brosur dengan fasilitas sama selalu
  // mencetak urutan yang sama — halaman detail memakai urutan tersimpan dan itu bisa berbeda per aset.
  const amenities = orderAmenities(listing.amenities ?? []).map((key) => amenityByKey.get(key)).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const specifications: [string, string][] = [
    ["Jenis aset", property.type],
    ["Luas tanah", property.land > 0 ? property.land.toLocaleString("id-ID") + " m²" : "—"],
    ["Luas bangunan", property.build > 0 ? property.build.toLocaleString("id-ID") + " m²" : "—"],
    ["Kamar tidur", property.beds > 0 ? String(property.beds) : "—"],
    ["Status", property.mode === "terjual" ? "Terjual" : listing.availabilityStatus === "available" ? "Tersedia" : "—"],
    ["SKU", listing.sku],
    ["Kota", listing.location?.city || "—"],
    ["Provinsi", listing.location?.province || "—"],
    ["Dipublikasikan", publishedLabel],
    ["Dicetak", printedLabel],
  ];

  const modeClass = property.mode === "lelang" ? styles.lelang : property.mode === "terjual" ? styles.terjual : styles.langsung;

  return <div className={styles.screen}>
    <BrosurActions detailHref={detailPath} autoPrint={print === "1"} />

    <article className={styles.sheet}>
      <header className={styles.letterhead}>
        <Image src="/image/logo/color/LP-logo-large-color.png" alt="Lelangan Properti" width={1944} height={809} priority />
        <div>
          <b className={styles.docTitle}>Brosur Properti</b>
          <span className={styles.docMeta}>{listing.sku}</span>
        </div>
      </header>

      <div className={styles.headline}>
        <div>
          <span className={`${styles.badge} ${modeClass}`}>{statusLabel(property.mode)}</span>
          <h1>{property.title}</h1>
          <p>⌖ {property.city || "Lokasi belum tersedia"}</p>
        </div>
        <div className={styles.price}>
          <span>{property.mode === "lelang" ? "Harga acuan" : "Harga penawaran"}</span>
          <strong>{formatRupiah(offer)}</strong>
          <small>{formatExactRupiah(offer)}</small>
        </div>
      </div>

      {images.length > 0 ? <div className={styles.gallery}>
        {/* unoptimized: /api/v1/media/* sudah menyajikan berkas jadi, dan pengoptimal next/image akan
            menambah satu lapisan cache yang tidak berguna untuk lembar sekali cetak. loading eager
            supaya foto sudah ada saat dialog cetak dibuka. */}
        <figure className={styles.hero}><Image src={images[0]} alt={property.title} width={760} height={500} unoptimized priority /></figure>
        {images.length > 1 && <div className={styles.thumbs}>
          {images.slice(1, 4).map((image, index) => <figure key={image}><Image src={image} alt={`${property.title} — foto ${index + 2}`} width={320} height={220} unoptimized priority /></figure>)}
        </div>}
      </div> : <p className={styles.noPhoto}>Foto belum tersedia untuk aset ini.</p>}

      <section className={styles.section}>
        <h2>Spesifikasi</h2>
        <dl className={styles.specs}>{specifications.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </section>

      <section className={styles.section}>
        <h2>Alamat</h2>
        <p className={styles.address}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
          {address}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Deskripsi</h2>
        <p>{property.desc || "Deskripsi belum tersedia."}</p>
      </section>

      {amenities.length > 0 && <section className={styles.section}>
        <h2>Akses &amp; Fasilitas</h2>
        <div className={styles.amenities}>{amenities.map((item) => <div key={item.key}><AmenityIconGlyph name={item.icon} /><b>{item.label}</b></div>)}</div>
      </section>}

      <footer className={styles.footer}>
        <div>
          <b>Hubungi pengelola</b>
          <span>{contact.phoneLabel}</span>
          <span>{contact.email}</span>
        </div>
        <div>
          <b>lelanganproperti.my.id</b>
          <span>{propertyUrl}</span>
          <p className={styles.disclaimer}>Lembar ini dicetak dari situs pada {printedLabel} dan bukan dokumen penawaran yang mengikat. Harga, status, dan ketersediaan dapat berubah sewaktu-waktu; konfirmasikan kepada pengelola sebelum bertransaksi.</p>
        </div>
      </footer>
    </article>
  </div>;
}
