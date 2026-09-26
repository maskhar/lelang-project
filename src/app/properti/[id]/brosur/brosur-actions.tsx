"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./brosur.module.css";

// Dialog cetak dibuka setelah semua foto selesai di-decode, bukan setelah jeda tetap. Referensi BRI
// memakai setTimeout(…, 2000) dengan gambar loading="lazy": kalau jaringan lambat, dialog terbuka
// sebelum foto siap dan brosur tercetak dengan kotak kosong. img.decode() menunggu piksel benar-benar
// siap, dan tetap dibatasi 8 detik supaya satu foto rusak tidak menggantung dialog selamanya.
async function waitForImages(timeoutMs = 8000) {
  const images = [...document.querySelectorAll("img")];
  const decoded = Promise.all(images.map((image) => image.decode().catch(() => undefined)));
  await Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

export default function BrosurActions({ detailHref, autoPrint }: { detailHref: string; autoPrint: boolean }) {
  const [busy, setBusy] = useState(autoPrint);
  // Cetak otomatis hanya sekali. Tanpa penjaga ini React Strict Mode di dev memanggilnya dua kali dan
  // dialog cetak terbuka dua kali berturut-turut.
  const printed = useRef(false);

  async function print() {
    setBusy(true);
    await waitForImages();
    setBusy(false);
    window.print();
  }

  useEffect(() => {
    if (!autoPrint || printed.current) return;
    printed.current = true;
    void print();
    // Sekali saat mount: ?print=1 adalah perintah sekali jalan dari tombol di halaman detail.
  }, [autoPrint]);

  return <div className={styles.bar}>
    <a href={detailHref}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5m7-7-7 7 7 7" /></svg>Kembali ke detail</a>
    <button type="button" onClick={print} disabled={busy}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8V3h10v5M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7z" /></svg>{busy ? "Menyiapkan foto…" : "Cetak / Simpan PDF"}</button>
    <p role="status">{busy ? "Menunggu semua foto selesai dimuat agar tidak tercetak kosong." : "Di dialog cetak, pilih tujuan “Simpan sebagai PDF” untuk menyimpan berkas."}</p>
  </div>;
}
