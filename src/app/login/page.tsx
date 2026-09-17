import Link from "next/link";
import Image from "next/image";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link href="/" className={styles.headerBrand}>
            <Image src="/image/logo/color/LP-logo-large-color.png" alt="Lelang Properti" width={1944} height={809} sizes="150px" priority />
          </Link>
          <nav className={styles.headerNav} aria-label="Navigasi utama">
            <Link href="/">Beranda</Link>
            <Link href="/#properti">Properti</Link>
            <Link href="/#cara-kerja">Cara kerja</Link>
            <Link href="/#kontak">Kontak</Link>
          </nav>
        </div>
      </header>

      <main className={styles.page}>
        <div className={styles.card}>
          <Image className={styles.logo} src="/image/logo/color/LP-logo-large-color.png" alt="Lelang Properti" width={1944} height={809} sizes="120px" />
          <h1>Masuk ke Dashboard</h1>
          <p>Gunakan akun Google yang sudah disetujui administrator. Tidak ada login password.</p>
          <a className={styles.google} href="/api/v1/auth/google/start">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
            Lanjutkan dengan Google
          </a>
          <p className={styles.footnote}>Google hanya memverifikasi identitas. Hak akses dikelola aplikasi.</p>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <nav className={styles.footerNav} aria-label="Dukungan">
            <Link href="/kebijakan-privasi">Kebijakan Privasi</Link><Link href="/syarat-dan-ketentuan">Syarat dan Ketentuan</Link>
            <Link href="/#kontak">Bantuan</Link>
          </nav>
          <p className={styles.copyright}>© 2026 Lelang Properti. Semua hak dilindungi.</p>
        </div>
      </footer>
    </div>
  );
}