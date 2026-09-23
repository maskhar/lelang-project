import Image from "next/image";
import Link from "next/link";
import styles from "./privacy.module.css";
import { contactEmail } from "@/lib/contact";

type PolicySection = { title: string; paragraphs: string[]; items?: string[] };

const sections: PolicySection[] = [
  { title: "1. Ruang Lingkup", paragraphs: ["Kebijakan Privasi ini menjelaskan cara Lelang Properti mengumpulkan, menggunakan, menyimpan, mengungkapkan, dan melindungi Data Pribadi saat Anda memakai website, mengirim minat atas properti, atau mengakses dashboard staf.", "Layanan ini adalah platform katalog dan pengelolaan pemasaran properti. Layanan tidak memproses pembayaran, penawaran lelang, KYC, atau transaksi pengalihan kepemilikan pada tahap ini."] },
  { title: "2. Data yang Kami Kumpulkan", paragraphs: ["Kami hanya mengumpulkan data yang relevan dengan fungsi layanan."], items: ["Data akun staf: nama, alamat email, identitas Google berupa subject identifier, status akses, dan peran pengguna.", "Data sesi dan keamanan: token sesi dalam bentuk hash, waktu masuk/aktif/berakhir, serta hash alamat IP dan user-agent untuk pengamanan dan pencatatan audit.", "Data minat calon pembeli: nama, alamat email dan/atau nomor telepon, pesan, persetujuan, serta properti yang diminati.", "Data listing: judul, deskripsi, alamat, kota/provinsi, koordinat lokasi, spesifikasi, harga, foto, dan informasi lain yang dimasukkan staf berwenang.", "Data teknis terbatas: data yang diperlukan untuk menjalankan permintaan, mencegah penyalahgunaan, dan memelihara keamanan layanan."] },
  { title: "3. Sumber Data", paragraphs: ["Data berasal dari Anda saat mengisi formulir atau menggunakan layanan, dari staf yang berwenang memasukkan data listing, serta dari Google ketika staf memilih masuk dengan Google. Google digunakan untuk verifikasi identitas melalui OpenID Connect; kami tidak menerima atau menyimpan kata sandi Google Anda."] },
  { title: "4. Tujuan Pemrosesan", paragraphs: ["Kami menggunakan Data Pribadi untuk menyediakan katalog dan dashboard, mengelola akun serta sesi, menanggapi minat calon pembeli, menjaga keamanan, mencegah spam atau akses tidak sah, membuat jejak audit, menjalankan dukungan operasional, dan memenuhi kewajiban hukum yang berlaku."] },
  { title: "5. Dasar Pemrosesan", paragraphs: ["Pemrosesan dilakukan berdasarkan persetujuan bila diperlukan, pelaksanaan permintaan atau layanan yang Anda ajukan, kepentingan yang sah untuk mengoperasikan layanan secara aman, serta kewajiban hukum yang berlaku. Bila dasar pemrosesan adalah persetujuan, Anda dapat menariknya dengan menghubungi kami, sepanjang penarikan tersebut tidak mengganggu pemrosesan yang wajib atau telah dilakukan secara sah."] },
  { title: "6. Cookie, Sesi, dan Penyimpanan Browser", paragraphs: ["Kami menggunakan cookie teknis untuk autentikasi sesi, perlindungan CSRF, dan proses masuk Google. Cookie sesi disetel untuk keamanan browser dan tidak digunakan untuk iklan berbasis perilaku.", "Browser juga dapat menyimpan pilihan properti secara lokal untuk fitur simpan properti. Data lokal tersebut tersimpan pada perangkat Anda dan dapat dihapus melalui pengaturan browser."] },
  { title: "7. Pengungkapan Data", paragraphs: ["Kami tidak menjual Data Pribadi. Data dapat diungkapkan secara terbatas kepada pihak yang membantu pengoperasian layanan, pihak yang Anda minta untuk dihubungkan terkait minat properti, atau otoritas yang berwenang apabila diwajibkan oleh hukum. Pengungkapan dilakukan hanya sejauh diperlukan untuk tujuan yang sah."] },
  { title: "8. Layanan Pihak Ketiga", paragraphs: ["Login staf menggunakan Google. Halaman properti dapat memuat atau menautkan Google Maps untuk menampilkan lokasi. Ketika Anda memakai layanan pihak ketiga tersebut, pemrosesan data mereka tunduk pada kebijakan privasi masing-masing penyedia. Kami menyarankan Anda membacanya sebelum menggunakan layanan tersebut."] },
  { title: "9. Keamanan dan Akses", paragraphs: ["Kami menerapkan pengendalian akses berbasis peran, sesi dengan token acak yang disimpan dalam bentuk hash, perlindungan CSRF untuk mutasi browser, pembatasan akses dashboard, pencatatan audit, dan penyimpanan media draft dalam area nonpublik. Tidak ada metode keamanan yang menjamin risiko nol; kami terus menilai langkah pengamanan yang diperlukan."] },
  { title: "10. Retensi dan Penghapusan", paragraphs: ["Kami menyimpan Data Pribadi selama diperlukan untuk tujuan yang dijelaskan dalam kebijakan ini, untuk keamanan dan audit, penyelesaian sengketa, atau selama diwajibkan oleh hukum. Setelah tidak lagi diperlukan, data akan dihapus, dianonimkan, atau dibatasi sesuai kebutuhan operasional dan ketentuan yang berlaku."] },
  { title: "11. Hak Anda", paragraphs: ["Sesuai ketentuan yang berlaku, Anda dapat meminta informasi tentang pemrosesan Data Pribadi, akses, perbaikan data yang tidak akurat, penarikan persetujuan, penghapusan, penghentian pemrosesan tertentu, atau mengajukan keberatan dan keluhan. Kami dapat meminta verifikasi identitas sebelum menindaklanjuti permintaan dan dapat membatasi permintaan tertentu bila terdapat kewajiban hukum atau alasan sah lainnya.", "Pemilik akun dapat menjalankan dua hak ini sendiri melalui halaman Akun di dashboard: mengunduh salinan data akun dalam format JSON, dan menghapus akun. Penghapusan akun mencabut seluruh sesi, memutus tautan akun Google, menghapus hak akses, serta menganonimkan nama, foto, dan nomor telepon. Catatan listing, lead, dan audit tetap kami simpan sesuai kewajiban hukum dan keperluan bukti transaksi, tanpa lagi terhubung ke profil aktif."] },
  { title: "12. Anak-anak", paragraphs: ["Layanan ini tidak ditujukan untuk pengumpulan Data Pribadi anak-anak. Jangan kirimkan Data Pribadi anak tanpa dasar yang sah dan persetujuan yang diperlukan dari orang tua atau wali."] },
  { title: "13. Perubahan Kebijakan", paragraphs: ["Kami dapat memperbarui kebijakan ini untuk mencerminkan perubahan layanan, keamanan, atau peraturan. Versi terbaru dan tanggal berlaku akan dipublikasikan pada halaman ini. Perubahan material dapat disertai pemberitahuan tambahan bila diperlukan."] },
];

export default function PrivacyPolicyPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Lelang Properti — Beranda"><Image src="/image/logo/white/LP-logo-large-white.png" alt="Lelang Properti" width={1944} height={809} priority /></Link>
      <nav aria-label="Navigasi kebijakan"><Link href="/">Beranda</Link><Link href="/#properti">Cari Properti</Link><Link href="/dashboard" className={styles.dashboard}>Dashboard</Link></nav>
    </header>
    <main className={styles.content}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Beranda</Link><span aria-hidden="true">/</span><span>Kebijakan Privasi</span></nav>
      <p className={styles.effective}>Berlaku mulai: 16 September 2026</p>
      <article>
        <p className={styles.eyebrow}>LELANG PROPERTI</p>
        <h1>Kebijakan Privasi</h1>
        <p className={styles.intro}>Dokumen ini menjelaskan bagaimana Lelang Properti mengelola Data Pribadi dalam layanan katalog, pemasaran, dan pengelolaan properti.</p>
        <div className={styles.summary}><h2>Ringkasan</h2><p>Kami mengumpulkan data seperlunya untuk menjalankan layanan, menjaga keamanan, dan menindaklanjuti minat properti. Kami tidak menjual Data Pribadi atau memproses pembayaran melalui layanan ini.</p></div>
        {sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}
        <section><h2>14. Hubungi Kami</h2><p>Untuk pertanyaan, permintaan terkait Data Pribadi, atau keluhan, hubungi kami melalui <a href={"mailto:" + contactEmail}>{contactEmail}</a>. Sertakan nama, kontak yang dapat dihubungi, dan uraian permintaan agar dapat kami tindak lanjuti.</p></section>
        <p className={styles.legal}>Kebijakan ini disusun untuk mendukung prinsip pelindungan data pribadi menurut peraturan yang berlaku di Indonesia, termasuk Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Dokumen ini bukan nasihat hukum dan perlu ditinjau kembali sebelum peluncuran produksi atau perubahan model layanan.</p>
      </article>
    </main>
    <footer className={styles.footer}><span>© 2026 Lelang Properti</span><Link href="/">Kembali ke beranda</Link></footer>
  </div>;
}
