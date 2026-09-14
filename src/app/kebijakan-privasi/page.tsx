import Image from "next/image";
import Link from "next/link";
import styles from "./privacy.module.css";

const sections = [
  ["1. Ruang Lingkup", "Kebijakan Privasi ini menjelaskan cara Lelang Properti mengumpulkan, menggunakan, menyimpan, dan melindungi Data Pribadi saat Anda menggunakan website, menghubungi kami, atau memasang properti melalui platform kami."],
  ["2. Data yang Kami Kumpulkan", "Kami dapat mengumpulkan nama, nomor telepon, alamat email, kota/kabupaten, informasi properti, foto yang Anda unggah, serta pesan atau dokumen yang Anda kirimkan. Kami juga dapat menerima data teknis terbatas, seperti jenis perangkat dan catatan penggunaan, untuk menjaga keamanan serta kinerja layanan."],
  ["3. Tujuan Penggunaan Data", "Data digunakan untuk menampilkan dan mengelola listing properti, menanggapi pertanyaan, menghubungkan pemilik dengan calon pembeli, melakukan verifikasi yang diperlukan, mencegah penyalahgunaan, serta meningkatkan layanan kami."],
  ["4. Dasar Pemrosesan", "Kami memproses Data Pribadi berdasarkan persetujuan Anda, pelaksanaan permintaan atau layanan yang Anda ajukan, kewajiban hukum yang berlaku, dan kepentingan yang sah untuk menjalankan platform secara aman dan bertanggung jawab."],
  ["5. Penyimpanan dan Keamanan", "Kami menerapkan langkah administratif dan teknis yang wajar untuk melindungi Data Pribadi dari akses, perubahan, pengungkapan, atau penghapusan tanpa wewenang. Data disimpan selama diperlukan untuk tujuan yang dijelaskan dalam kebijakan ini atau selama diwajibkan oleh peraturan yang berlaku."],
  ["6. Pengungkapan kepada Pihak Lain", "Kami tidak menjual Data Pribadi Anda. Data dapat dibagikan secara terbatas kepada pihak yang membantu pengoperasian layanan, calon pihak transaksi sesuai permintaan Anda, atau pihak berwenang apabila diwajibkan oleh hukum. Setiap pengungkapan dilakukan seperlunya untuk tujuan yang sah."],
  ["7. Hak Anda", "Anda dapat meminta akses, pembaruan, perbaikan, penarikan persetujuan, atau penghapusan Data Pribadi sesuai ketentuan yang berlaku. Pengajuan dapat dikirimkan melalui kontak kami. Beberapa permintaan dapat dibatasi apabila kami masih memiliki kewajiban hukum atau kebutuhan sah untuk menyimpan data tersebut."],
  ["8. Penyimpanan Browser", "Platform dapat menggunakan penyimpanan lokal pada browser untuk fitur seperti menyimpan properti pilihan. Data ini berada pada perangkat Anda dan dapat dihapus melalui pengaturan browser."],
  ["9. Tautan Pihak Ketiga", "Website dapat memuat tautan ke layanan pihak ketiga. Kebijakan ini tidak berlaku pada layanan tersebut. Kami menyarankan Anda membaca kebijakan privasi masing-masing pihak sebelum memberikan data."],
  ["10. Perubahan Kebijakan", "Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Versi terbaru akan tersedia pada halaman ini beserta tanggal berlakunya. Penggunaan layanan setelah perubahan berlaku berarti Anda memahami kebijakan yang diperbarui."],
];

export default function PrivacyPolicyPage() {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="Lelang Properti — Beranda"><Image src="/image/logo/white/LP-logo-large-white.png" alt="Lelang Properti" width={1944} height={809} priority /></Link>
      <nav aria-label="Navigasi kebijakan"><Link href="/">Beranda</Link><Link href="/#properti">Cari Properti</Link><Link href="/dashboard" className={styles.dashboard}>Dashboard</Link></nav>
    </header>
    <main className={styles.content}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Beranda</Link><span aria-hidden="true">/</span><span>Kebijakan Privasi</span></nav>
      <p className={styles.effective}>Berlaku mulai: 14 September 2026</p>
      <article>
        <p className={styles.eyebrow}>LELANG PROPERTI</p>
        <h1>Kebijakan Privasi</h1>
        <p className={styles.intro}>Lelang Properti menghormati privasi Anda. Kebijakan ini menerangkan pengelolaan Data Pribadi pada layanan pencarian, pemasaran, dan transaksi properti kami.</p>
        <div className={styles.summary}><h2>Ringkasan</h2><p>Kami mengumpulkan data yang diperlukan untuk menjalankan layanan, menggunakannya secara terbatas untuk kebutuhan layanan, dan tidak menjual Data Pribadi Anda.</p></div>
        {sections.map(([title, text]) => <section key={title}><h2>{title}</h2><p>{text}</p></section>)}
        <section><h2>11. Hubungi Kami</h2><p>Untuk pertanyaan, permintaan terkait Data Pribadi, atau keluhan, hubungi kami melalui <a href="mailto:halo@lelangproperti.id">halo@lelangproperti.id</a>.</p></section>
        <p className={styles.legal}>Kebijakan ini disusun dengan mengacu pada prinsip pelindungan data pribadi sesuai peraturan perundang-undangan yang berlaku di Indonesia, termasuk Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p>
      </article>
    </main>
    <footer className={styles.footer}><span>© 2026 Lelang Properti</span><Link href="/">Kembali ke beranda</Link></footer>
  </div>;
}
