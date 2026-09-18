# PRD — Lelang Properti

Tanggal: 15 September 2026 | Versi: 2.0 | Status: Arah teknis disetujui; detail implementasi draft

## Keputusan backend mandiri

Backend dibangun dan dioperasikan sendiri, tanpa Supabase atau BaaS: Next.js + TypeScript, PostgreSQL mandiri, Drizzle ORM/Kit, Google OpenID Connect untuk identitas, session/RBAC aplikasi, storage volume persisten melalui adapter, SMTP, dan worker transactional outbox. Dokumen ini menggantikan keputusan integrasi lama.

Tidak ada akses ke instance/server lama dalam rancangan baru. Kondisi development pada 19 September 2026: schema mandiri, Google OAuth/session/CSRF, self-signup buyer otomatis untuk pengguna Google baru, katalog/detail PostgreSQL, dashboard terlindungi, workflow listing, media, lead, audit, outbox, metrics, backup lokal, manajemen role/status akun dari dashboard admin, dan restore ephemeral tersedia. Akun staf tetap dipraotorisasi. Migrasi data/foto SQLite lama, MFA, dan deployment produksi belum selesai.

## 1. Tujuan dan batas dokumen

Menjadikan prototype katalog properti sebagai layanan produksi dengan data persisten, dashboard terlindungi, pengelolaan listing, dan alur kontak yang jelas. Estimasi kesiapan UI 75% berasal dari pemilik produk, bukan hasil pengukuran engineering. Dokumen ini menetapkan rancangan, bukan menyatakan backend sudah dibangun.

MVP usulan: katalog dan pengelolaan aset oleh operator internal. Akun pembeli, penjual eksternal, bidding uang nyata, KYC, dan pembayaran adalah fase lanjutan yang membutuhkan persetujuan bisnis. Istilah lelang pada prototype tidak otomatis berarti platform menyelenggarakan lelang resmi.

## 2. Baseline repository

| Area | Kondisi teramati | Gap produksi |
| --- | --- | --- |
| Web | Next.js App Router, React, TypeScript | Belum ada backend multi-pengguna |
| Katalog | Pencarian, filter, sort, 16 seed | Query dan pagination server dibutuhkan |
| Detail | Galeri, spesifikasi, rekomendasi, peta kota | Kontak/transaksi belum aktif; jangan klaim koordinat tepat |
| Dashboard | Form tambah properti | Belum login, edit, moderasi, atau audit |
| API | GET/POST `/api/properties` | POST memeriksa origin localhost, bukan identitas pengguna |
| Data | SQLite dengan payload JSON | Normalisasi, migrasi, backup produksi |
| Foto | File lokal dan GET `/api/uploads/[filename]` | Storage produksi dan kontrol akses |
| Lelang | Nominal bid, jumlah penawar, durasi demo | Tidak ada ledger bid atau peserta nyata |

Sumber internal: `src/app/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/properti/[id]/page.tsx`, `src/app/api/properties/route.ts`, `src/lib/db.ts`, `src/lib/properties.ts`.

## 3. Masalah, tujuan, dan ukuran keberhasilan

- Pembeli membutuhkan katalog aset konsisten dan mudah dicari.
- Operator membutuhkan pengelolaan listing tanpa akses langsung database.
- Bisnis membutuhkan jejak perubahan dan permintaan kontak yang dapat ditindaklanjuti.
- Target MVP: semua mutasi inventaris memerlukan akun berizin; draft tidak bocor ke publik; data tetap ada setelah restart/deployment.
- Target usulan, belum terukur: P95 katalog <= 500 ms pada 20 request/detik dan 10.000 listing uji; keberhasilan submit valid >= 99%; uptime bulanan 99,5%.
- Metrik produk: pencarian ke detail, detail ke kontak, lead valid, waktu draft ke publikasi. Baseline dan target konversi ditentukan setelah pilot.

## 4. Persona dan hak akses

| Peran | Akses MVP |
| --- | --- |
| Pengunjung | Katalog dan detail publik; kirim minat/kontak |
| Editor internal | Buat/edit draft, unggah foto, ajukan publikasi, proses lead |
| Administrator | Undang/nonaktifkan editor, review/publikasi/arsip, audit |

Asumsi: satu organisasi pengelola; editor dapat mengelola inventaris bersama. `createdBy` adalah atribusi, bukan tenancy. Penjual eksternal dan ownership per organisasi harus dirancang sebelum onboarding pihak luar.

## 5. Kebutuhan MVP dan penerimaan

| ID | Prioritas | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- | --- |
| FR-01 | P0 | Login Google: akun staf dipraotorisasi, pengguna baru diprovisikan otomatis dengan role `buyer`; logout | Tanpa sesi: 401; peran salah: 403; akun nonaktif ditolak; signup dibatasi rate limit global/per-IP dan tercatat audit `auth.google.signup` |
| FR-02 | P0 | Katalog dengan kata kunci, tipe, wilayah, harga, mode, status; sort terbaru/harga/tenggat | Filter dapat digabung; pagination stabil; input invalid: 422 |
| FR-03 | P0 | Detail publik dan galeri | Draft/arsip: 404; data kosong tidak diganti klaim rekaan |
| FR-04 | P0 | Draft, edit, review, publikasi, revisi, arsip | Server validasi transisi; edit bersamaan menghasilkan konflik versi |
| FR-05 | P0 | JPEG/PNG/WebP, maksimal 20 foto dan 5 MiB/foto | Server verifikasi isi/ukuran; foto gagal tidak tampil; urutan tersimpan |
| FR-06 | P0 | Tipe, judul, deskripsi, wilayah, luas, kamar, IDR | Harga rupiah bulat positif; angka tidak negatif; wilayah valid |
| FR-07 | P0 | Jadwal dan informasi lelang, tanpa bidding internal | Waktu absolut; seed berlabel simulasi; tombol tidak mengklaim bid tercatat |
| FR-08 | P0 | Form minat dengan satu kanal kontak dan persetujuan | Listing harus publik; rate limit; kontak hanya dibaca staf berizin |
| FR-09 | P0 | Audit perubahan dan publikasi | Aktor, waktu, aksi, entitas, alasan tercatat tanpa token/password |
| FR-10 | P0 | Backup, restore, monitoring | Restore staging berhasil sebelum rilis |
| FR-11 | P1 | Notifikasi email lead/review | Kegagalan email tidak menghilangkan lead; retry terlihat operator |
| FR-12 | P1 | Ringkasan dashboard | Angka berasal dari database, bukan nilai statis |

P0 wajib untuk pilot. P1 dapat menyusul bila operator tetap bisa memproses aktivitas melalui dashboard.

## 6. Aturan produk

- Pisahkan `saleMode` (`auction`, `direct_sale`) dari `publicationStatus` dan `availabilityStatus` (`available`, `sold`). Prototype mencampurkannya melalui `mode`.
- Listing hanya publik setelah admin menyetujui. Perubahan konten publik dilakukan pada revisi draft; versi publik lama tetap tampil sampai revisi disetujui.
- Harga katalog adalah harga penawaran/pembukaan, bukan otomatis harga transaksi atau bid tertinggi.
- Simpan waktu UTC; tampilkan zona waktu eksplisit. Default UI usulan WIB (`Asia/Jakarta`), membutuhkan persetujuan bisnis.
- Nilai `duration` demo bukan jadwal nyata. Publikasi lelang memerlukan `startsAt`, `endsAt`, sumber, dan ketentuan terverifikasi operator.
- Kontak nyata berasal dari konfigurasi operator; jangan memakai kontak contoh produksi.
- `sold` hanya ditetapkan admin dengan alasan; riwayat tidak dihapus.
- Retensi lead dan audit masih keputusan terbuka. Sebelum produksi harus ada kebijakan penghapusan, pemberitahuan privasi, dan penanggung jawab data. Dokumen ini bukan pendapat hukum.

## 7. Alur pengguna

### Publikasi

1. Editor login, membuat draft, mengisi data wajib, dan menambahkan foto.
2. Editor mengirim revisi untuk review; admin menyetujui atau meminta perbaikan dengan alasan.
3. Publikasi mengganti snapshot publik secara atomik dan mencatat audit.
4. Perubahan berikutnya membuat revisi baru, bukan mengubah snapshot publik diam-diam.

### Penemuan dan kontak

1. Pengunjung mencari dan memfilter aset, lalu membuka detail.
2. Pengunjung mengirim form minat dengan persetujuan dan kontak valid.
3. Sistem menyimpan lead, menampilkan bukti penerimaan, lalu mengirim notifikasi asinkron.
4. Editor memproses status `new`, `contacted`, `closed`, atau `spam`.

## 8. Nonfungsional dan operasional

- Google Authorization Code flow memakai PKCE, state, nonce, issuer/audience/signature/expiry verification. Google `sub` menjadi identitas immutable; email hanya atribut. Cookie sesi opaque memakai HttpOnly/Secure produksi; sesi dicabut saat role/status berubah.
- MFA administrator wajib sebelum produksi publik; tidak termasuk kemampuan reader session awal.
- Tim memegang tanggung jawab patch OS/library, backup database dan file, rotasi secret, pengiriman email, serta response insiden.

- TLS produksi; sesi aman; otorisasi setiap mutasi dan pembacaan privat.
- Tidak ada secret atau PII pada repository, log, atau cache publik.
- Pagination dibatasi 100 item; ukuran request/upload dibatasi sebelum diproses.
- Target backup harian, RPO <= 24 jam dan RTO <= 4 jam; validasi lewat latihan restore.
- Akses keyboard dan label form dipertahankan pada integrasi backend; regresi UI diuji.
- Staging terpisah dari produksi; email, database, bucket, dan credential berbeda.

## 9. Roadmap dan release gate

| Fase | Deliverable | Gate |
| --- | --- | --- |
| 0: Fondasi | PostgreSQL, schema, auth internal, role, environment, CI | Auth/otorisasi lulus; seed dipisah dari produksi |
| 1: MVP katalog | Workflow revisi, media, lead, audit, dashboard | P0 lulus, restore teruji, review privasi/konten selesai |
| 2: Akun publik | Favorit lintas perangkat, penjual eksternal bila disetujui | Ownership/tenancy dan verifikasi diputuskan |
| 3: Bidding opsional | Peserta, bid atomik, penutupan, hasil | Model bisnis, legalitas, ketentuan, anti-abuse, uji concurrency disetujui |
| 4: Transaksi | KYC, jaminan, pembayaran/refund | Vendor, rekonsiliasi, sengketa, kebijakan legal disetujui |

Tidak ada estimasi minggu sebelum ukuran tim dan keputusan scope tersedia. MVP tidak mencakup escrow, settlement, klaim legalitas otomatis, atau aplikasi native.

## 10. Keputusan pemilik produk

1. Katalog/perantara atau penyelenggara bidding internal? Default rancangan: katalog dahulu.
2. Listing operator atau juga penjual eksternal? Default: operator internal.
3. Kanal kontak produksi, penerima lead, dan prosedur tindak lanjut?
4. Host mandiri, anggaran, region data, backup di lokasi kedua, SMTP, dan Google OAuth client produksi?
5. Dokumen legal wajib, alamat lengkap publik, dan persetujuan pemilik aset?
6. Retensi data, syarat layanan, dan kewenangan menandai aset terjual?

Rancangan teknis dan pemetaan kebutuhan ada pada `docs/SDD.md`.
