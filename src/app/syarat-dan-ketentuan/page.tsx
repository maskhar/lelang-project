import Image from "next/image";
import Link from "next/link";
import styles from "../kebijakan-privasi/privacy.module.css";

type TermsSection = { title: string; paragraphs: string[]; items?: string[] };

const sections: TermsSection[] = [
  { title: "1. Penerimaan Syarat", paragraphs: ["Dengan mengakses atau menggunakan website Lelang Properti, Anda menyatakan telah membaca, memahami, dan menyetujui Syarat dan Ketentuan ini serta Kebijakan Privasi.", "Jika Anda tidak setuju, jangan gunakan layanan. Kami dapat memperbarui ketentuan ini dari waktu ke waktu; versi terbaru berlaku sejak tanggal yang tercantum pada halaman ini."] },
  { title: "2. Definisi", paragraphs: ["Dalam ketentuan ini, Lelang Properti berarti pengelola website; Pengguna berarti setiap pengunjung; Staf berarti pengguna dashboard yang diberi akses; Listing berarti informasi properti yang dikelola dalam layanan; dan Lead berarti minat atau pesan calon pihak transaksi."] },
  { title: "3. Fungsi Layanan", paragraphs: ["Layanan menyediakan katalog properti, pengelolaan listing oleh staf, dan formulir minat. Layanan bukan bank, escrow, penyelenggara pembayaran, broker berizin, notaris, PPAT, penasihat hukum, penilai, atau penyelenggara lelang resmi.", "Pengiriman minat bukan penawaran yang mengikat, persetujuan transaksi, pembayaran, maupun jaminan ketersediaan properti."] },
  { title: "4. Kelayakan dan Penggunaan", paragraphs: ["Anda wajib menggunakan layanan secara sah, memberikan informasi yang benar, dan tidak memakai layanan untuk melanggar hukum atau hak pihak lain. Bila menggunakan layanan untuk badan usaha, Anda menyatakan memiliki kewenangan yang diperlukan."] },
  { title: "5. Akun Dashboard", paragraphs: ["Dashboard hanya untuk staf yang disetujui administrator melalui akun Google. Anda wajib menjaga keamanan perangkat dan akun Google Anda, serta segera melaporkan dugaan akses tanpa wewenang.", "Kami dapat membatasi, menonaktifkan, atau mencabut akses dashboard bila terdapat pelanggaran, risiko keamanan, informasi tidak akurat, atau alasan operasional dan hukum yang sah."] },
  { title: "6. Ketentuan Listing", paragraphs: ["Staf bertanggung jawab memastikan informasi, foto, alamat, koordinat, harga, status, dan materi listing akurat, memiliki dasar yang sah, serta tidak melanggar hak pihak lain."], items: ["Jangan mempublikasikan data pribadi, dokumen kepemilikan, atau lokasi sensitif tanpa dasar dan otorisasi yang memadai.", "Jangan mengunggah materi yang palsu, menyesatkan, melanggar hak cipta, mengandung malware, atau melanggar hukum.", "Foto dan media draft tidak bersifat publik sampai melalui alur review dan publikasi yang berlaku.", "Kami dapat menolak, meminta revisi, menjeda, atau mengarsipkan listing yang tidak memenuhi ketentuan."] },
  { title: "7. Harga, Ketersediaan, dan Informasi Properti", paragraphs: ["Harga, status, spesifikasi, lokasi, dan foto pada listing dapat berubah. Pengguna wajib melakukan pemeriksaan mandiri, termasuk kunjungan lokasi, verifikasi legalitas, kondisi fisik, dokumen, harga, pajak, dan kewajiban lain sebelum mengambil keputusan.", "Peta dan koordinat merupakan informasi penunjang; akurasi lokasi perlu diverifikasi langsung dengan pihak terkait."] },
  { title: "8. Minat dan Komunikasi", paragraphs: ["Dengan mengirim formulir minat, Anda menyetujui agar informasi kontak dan pesan diteruskan kepada pihak yang menangani properti untuk tindak lanjut. Jangan mengirim spam, konten melanggar hukum, atau informasi palsu.", "Kami tidak menjamin waktu respons, ketersediaan properti, maupun terjadinya transaksi setelah minat dikirim."] },
  { title: "9. Larangan", paragraphs: ["Anda dilarang mengakses sistem tanpa wewenang, mengganggu keamanan, mengambil data secara otomatis tanpa izin, mengunggah kode berbahaya, menyamar sebagai pihak lain, atau menggunakan layanan untuk penipuan, pencucian uang, atau pelanggaran hukum lainnya."] },
  { title: "10. Hak Kekayaan Intelektual", paragraphs: ["Merek, desain, perangkat lunak, dan materi layanan dimiliki atau digunakan secara sah oleh Lelang Properti atau pemberi lisensinya. Anda tidak boleh menyalin, memodifikasi, mendistribusikan, atau mengeksploitasi materi tersebut tanpa izin, kecuali diizinkan oleh hukum.", "Pengunggah listing menyatakan memiliki hak atau izin yang diperlukan atas materi yang diunggah."] },
  { title: "11. Tautan dan Layanan Pihak Ketiga", paragraphs: ["Layanan dapat memuat tautan atau integrasi pihak ketiga, termasuk Google untuk autentikasi dan peta. Penggunaan layanan tersebut tunduk pada ketentuan penyedia masing-masing. Kami tidak bertanggung jawab atas konten, ketersediaan, atau praktik pihak ketiga."] },
  { title: "12. Batas Tanggung Jawab", paragraphs: ["Sejauh diizinkan hukum, Lelang Properti tidak menjamin layanan bebas gangguan atau bebas kesalahan, serta tidak bertanggung jawab atas keputusan transaksi, sengketa antara para pihak, ketidakakuratan informasi yang diberikan pengguna, atau kerugian tidak langsung yang timbul dari penggunaan layanan.", "Tidak ada dalam ketentuan ini yang membatasi tanggung jawab yang tidak boleh dibatasi berdasarkan hukum yang berlaku."] },
  { title: "13. Penangguhan dan Penghentian", paragraphs: ["Kami dapat mengubah, menangguhkan, atau menghentikan sebagian layanan maupun akses pengguna untuk pemeliharaan, keamanan, pelanggaran ketentuan, atau alasan operasional yang sah. Penghentian akses tidak menghapus kewajiban yang telah timbul sebelumnya."] },
  { title: "14. Hukum dan Penyelesaian Perselisihan", paragraphs: ["Ketentuan ini diatur oleh hukum Republik Indonesia. Perselisihan akan diupayakan terlebih dahulu melalui musyawarah. Bila tidak selesai, penyelesaian dilakukan melalui mekanisme yang tersedia menurut hukum yang berlaku."] },
  { title: "15. Kontak", paragraphs: ["Untuk pertanyaan atau keluhan mengenai ketentuan ini, hubungi kami melalui halo@lelangproperti.id."] },
];

export default function TermsPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Lelang Properti — Beranda"><Image src="/image/logo/white/LP-logo-large-white.png" alt="Lelang Properti" width={1944} height={809} priority /></Link>
      <nav aria-label="Navigasi ketentuan"><Link href="/">Beranda</Link><Link href="/#properti">Cari Properti</Link><Link href="/dashboard" className={styles.dashboard}>Dashboard</Link></nav>
    </header>
    <main className={styles.content}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Beranda</Link><span aria-hidden="true">/</span><span>Syarat dan Ketentuan</span></nav>
      <p className={styles.effective}>Berlaku mulai: 16 September 2026</p>
      <article>
        <p className={styles.eyebrow}>LELANG PROPERTI</p>
        <h1>Syarat dan Ketentuan</h1>
        <p className={styles.intro}>Dokumen ini mengatur penggunaan website, katalog properti, formulir minat, dan dashboard Lelang Properti.</p>
        <div className={styles.summary}><h2>Ringkasan</h2><p>Layanan membantu publik menemukan informasi properti dan staf mengelola listing. Setiap pihak wajib memverifikasi informasi dan menyelesaikan transaksi secara mandiri sesuai hukum yang berlaku.</p></div>
        {sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}
        <p className={styles.legal}>Dokumen ini bukan nasihat hukum. Tinjauan oleh penasihat hukum diperlukan sebelum peluncuran produksi, aktivasi pembayaran, proses lelang resmi, atau fitur transaksi bernilai tinggi.</p>
      </article>
    </main>
    <footer className={styles.footer}><span>© 2026 Lelang Properti</span><Link href="/">Kembali ke beranda</Link></footer>
  </div>;
}