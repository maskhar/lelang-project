# Lelang Properti

Prototype Next.js App Router, TypeScript, React, dan CSS berdasarkan referensi HTML.

## Jalankan

```sh
npm install
npm run dev
```

Buka localhost:3000. Validasi dengan `npm run lint` dan `npm run build`.

## Fitur

- 16 properti contoh, filter kata kunci, jenis, harga, dan status.
- Pengurutan harga dan tenggat lelang, modal native dengan Escape dan penguncian fokus.
- Navigasi mobile dan notifikasi untuk tindakan yang belum terhubung backend.

## Batasan

Semua data simulasi. Belum ada login lengkap, penawaran nyata, atau pembayaran. Data prototype tersimpan di SQLite lokal. Kontak adalah contoh. Tenggat demo dihitung dari 14 September 2026 pukul 00:00 UTC; tidak dimulai ulang ketika halaman dimuat. Urutan terbaru memakai ID sebagai pengganti tanggal publikasi. Font Google diunduh saat build, sehingga build membutuhkan internet.

## Dashboard dan storage lokal

- Dashboard: `/dashboard`.
- API properti: `/api/properties`.
- Database SQLite lokal: `data/lelang-properti.sqlite`.
- Foto lokal: disimpan di `STORAGE_ROOT` (di luar repo, lihat `.env.local`) dalam `public/YYYY/MM/DD/<uuid>`, disajikan melalui `/api/v1/media/{id}`. Endpoint lama `/api/uploads/[filename]` mengembalikan 410. Maksimal 20 foto per revisi dan 5 MiB per foto.
- 16 properti awal menjadi seed idempoten dan tidak dihapus ketika properti baru ditambahkan.
- Harga disimpan sebagai nominal rupiah utuh. Contoh `6000000000` ditampilkan sebagai `Rp 6 M`.
- Kota/kabupaten untuk autocomplete berasal dari `nolimitid/nama-tempat-indonesia`; relasi provinsi dibundel lokal untuk pengisian otomatis.
- Dashboard sengaja dibatasi ke `localhost` dan belum memiliki login. Gunakan hanya untuk prototype lokal.

## Backend mandiri

Arah baru: Next.js + PostgreSQL mandiri + Drizzle, login Google OpenID Connect, session opaque milik aplikasi, storage volume persisten, webhook keluar, dan worker outbox. Tidak memakai Supabase. Google hanya identity provider; profil, role, dan sesi tetap dikelola aplikasi. UI katalog/dashboard tetap menggunakan SQLite.

Aturan: `AGENTS.md`. Kebutuhan: `docs/PRD.md`. Desain: `docs/SDD.md`. Setup/status: `docs/backend-setup.md`.

Backend lokal: `npm run backend:setup` (sekali), `npm run backend:up`, `npm run db:migrate`, `npm run db:grant:local`. Verifikasi API: `npm run build` lalu `npm run test:auth`. Jangan jalankan setup ulang bila file environment sudah ada.

Setujui akun Google development sebelum login: `npm run user:approve -- --email anda@gmail.com --name "Nama Anda" --role admin`. Detail pembatasan CLI ada pada `docs/backend-setup.md`.

## Deploy produksi (Docker)

Stack self-hosted terpisah dari development: `docker-compose.yml`, `Dockerfile`, `.env.docker.example`. Panduan lengkap: `docs/docker-deploy.md`.
