# Deploy produksi dengan Docker Compose

Diperbarui 18 September 2026. Stack ini berjalan di mesin sendiri (self-hosted), terpisah total dari
backend development (`compose.backend.yml`, port 15432). Tunnel/domain tidak termasuk di sini — app
hanya mendengar HTTP di dalam container; TLS diakhiri oleh tunnel atau reverse proxy yang menempel
pada `carubra-network` / `maskhar-network`.

## Komponen

| Service | Container | Image / target | Network | Port host |
|---|---|---|---|---|
| `postgres` | `project-lelangan-properti-postgres` | `postgres:17.6-bookworm` | `internal` | `127.0.0.1:15433` |
| `app` | `project-lelangan-properti-app` | `Dockerfile` target `runner` (Next.js standalone) | `internal`, `carubra-network`, `maskhar-network` | `127.0.0.1:3009` |
| `worker` | `project-lelangan-properti-worker` | `Dockerfile` target `worker` (`scripts/run-worker.ts`) | `internal` | — |

- Nama compose project: `project-lelangan-properti`. Network `internal` dibuat compose
  (`project-lelangan-properti-internal`); `carubra-network` dan `maskhar-network` harus sudah ada
  (`external: true`).
- Port 3009 dan 15433 dipilih karena belum dipakai container/proses lain di mesin ini saat file
  dibuat; ubah lewat `APP_PORT` / `POSTGRES_PORT` bila bentrok. Keduanya bind ke loopback saja.
- Data PostgreSQL di named volume `project-lelangan-properti-postgres-data`. Foto di bind mount
  `STORAGE_HOST_PATH` → `/data/storage` (`STORAGE_ROOT` container), dipakai bersama app dan worker.
- Database hanya di network `internal`. Role runtime `lelang_app` dan role migrasi `lelang_migrator`
  berbeda; migrasi dan grant dijalankan dari host lewat port loopback, bukan dari dalam container,
  sehingga image runtime tidak membawa drizzle-kit.
- Reverse proxy/tunnel mengarah ke `http://project-lelangan-properti-app:3000` di network yang sama.

## Setup pertama kali

1. Pastikan network eksternal ada: `docker network ls` harus memuat `carubra-network` dan
   `maskhar-network`. Jika belum: `docker network create carubra-network` (dan/atau `maskhar-network`).
2. Salin `.env.docker.example` ke `.env.docker.local`, isi seluruh nilai. Secret hex 64 karakter:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   `APP_BASE_URL` wajib `https://<domain>`; `GOOGLE_REDIRECT_URI` harus persis
   `<APP_BASE_URL>/api/v1/auth/google/callback` dan terdaftar pada OAuth client di Google Cloud.
   `STORAGE_HOST_PATH` path absolut di luar repository (buat foldernya dulu). Jangan commit file ini.
3. Build dan jalankan:

   ```bash
   npm run docker:up
   ```

   `init.docker.sh` hanya berjalan saat volume PostgreSQL masih kosong; ia membuat role
   `lelang_app` dan `lelang_migrator`. Rotasi password sesudahnya memakai `ALTER ROLE`, bukan
   membuat ulang volume.
4. Terapkan migrasi lalu grant runtime (dari host, target `127.0.0.1:15433`):

   ```bash
   npm run docker:migrate
   ```

   ```bash
   npm run docker:grant
   ```

   Setelah grant, app dan worker perlu restart agar koneksi lama tidak menahan privilege usang:
   `docker compose --env-file .env.docker.local restart app worker`.
5. Praotorisasi akun Google (tidak ada signup publik):

   ```bash
   npm run docker:user:approve -- --email anda@gmail.com --name "Nama Anda" --role admin
   ```

   Varian: `docker:user:disable`, `docker:user:enable`, `docker:user:role`.
6. Cek kesehatan:

   ```bash
   curl -s http://127.0.0.1:3009/api/v1/health/ready
   ```

   Harus `{"status":"ready","database":"ok",...}`. `docker compose ps` menampilkan `healthy` untuk
   `postgres` dan `app`. Log: `npm run docker:logs`.

## Update rilis

```bash
git pull
```

```bash
npm run docker:up
```

`docker:up` selalu `--build`; image lama ditimpa. Bila ada file migrasi baru di `drizzle/`, jalankan
`npm run docker:migrate` lalu `npm run docker:grant` (grant idempoten, aman diulang; tabel baru butuh
grant ulang). `npm run docker:down` menghentikan container tanpa menghapus volume; jangan memakai
`down -v` kecuali sengaja menghapus seluruh database produksi.

## Catatan keamanan

- `.env.docker.local` berisi secret produksi: tidak boleh di-commit, dicetak, atau ditempel di
  log/issue. `.dockerignore` menolak seluruh `.env*` masuk build context.
- Login dev (`/api/v1/auth/dev-login`) mati sendiri pada `NODE_ENV=production`; jangan ubah gerbangnya.
- Container `app` dan `worker` berjalan sebagai user non-root; `postgres` tidak diekspos ke network
  eksternal mana pun.
- Rate limit login: kuota per-IP (20 percobaan/menit untuk `/api/v1/auth/google/start` dan
  `/callback`) membaca hop pertama header `X-Forwarded-For`, lalu `X-Real-IP`. Tunnel/reverse proxy
  wajib menyetel salah satunya secara jujur. Bila tidak disetel, kuota per-IP dilewati dan hanya
  kuota global (100/menit) yang berlaku — bukan bypass, tetapi perlindungannya lebih lemah.

## Backup dan uji restore produksi

Isi `DOCKER_BACKUP_ROOT` pada `.env.docker.local` dengan path absolut privat di luar repository.

```bash
npm run docker:backup
```

Menghasilkan dua artefak berpasangan di `DOCKER_BACKUP_ROOT` (mode `0600`):
`lelang-prod-<waktu>.dump` (format custom `pg_dump`, dibuat lewat socket lokal di dalam container
postgres sehingga tidak ada password yang ditulis ke mana pun) dan
`lelang-prod-<waktu>-storage.tar.gz` (arsip **penuh** `STORAGE_HOST_PATH` setiap kali dijalankan —
bukan incremental, jadi perhitungkan pertumbuhan ruang disk dan hapus arsip lama secara berkala).
Bila salah satu langkah gagal, kedua artefak parsial dihapus dan exit code bukan nol.

Backup tanpa uji restore tidak bisa dianggap backup:

```bash
npm run docker:test:restore
```

Menjalankan container PostgreSQL sementara di `127.0.0.1:25435` (development memakai 25434),
`pg_restore --no-owner --no-privileges` dump terbaru, memverifikasi `app.properties`,
`app.user_sessions`, `app.outbox_events`, lalu memeriksa arsip storage pasangannya bisa dibaca.
Container dihentikan lagi pada blok `finally`, termasuk ketika verifikasi gagal. Database produksi
tidak pernah disentuh.

Penjadwalan di host Windows: buat entri Task Scheduler yang menjalankan `npm run docker:backup`
pada direktori repository (harian di luar jam sibuk), dan jalankan `npm run docker:test:restore`
minimal sebulan sekali secara manual atau terjadwal.
