"use client";

import { useState } from "react";
import styles from "./dashboard-shell.module.css";

export default function WelcomeModal() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return <div className={styles.modalBackdrop} role="presentation">
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className={styles.modalEyebrow}>SELAMAT DATANG</div>
      <h2 id="welcome-title">Siapkan pengelolaan properti Anda</h2>
      <p>Gunakan dashboard untuk mengelola listing, foto, review, dan minat calon pembeli secara teratur.</p>
      <ul>
        <li>Pastikan alamat, koordinat, harga, dan foto properti akurat.</li>
        <li>Jangan unggah dokumen atau data pribadi tanpa kewenangan.</li>
        <li>Periksa status review sebelum listing dipublikasikan.</li>
      </ul>
      <p className={styles.modalNote}>Dengan melanjutkan, Anda menyetujui <a href="/syarat-dan-ketentuan">Syarat dan Ketentuan</a> dan memahami <a href="/kebijakan-privasi">Kebijakan Privasi</a>.</p>
      <button type="button" className="button dark" onClick={() => setOpen(false)}>Mengerti</button>
    </section>
  </div>;
}