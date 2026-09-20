# Setup backend mandiri dengan Google Login

Diperbarui 20 September 2026. PostgreSQL development lokal sudah berjalan melalui Compose. Notifikasi email dihapus; penggantinya dua webhook keluar (`lead_notification` dan `staff_notification`). Drizzle journal 0000–0003 diterapkan ke database development lokal; jangan reset baseline atau mengedit migrasi yang sudah diterapkan. Migrasi 0003 menghapus password hash dan token password lama. Server lama tidak digunakan.

## Yang tersedia

- PostgreSQL 17.6 pada loopback port 15432, database lelang_properti_dev, role lelang_app dan lelang_migrator terpisah.
- Webhook keluar diatur dari `/dashboard/webhooks`: `lead_notification` (lead → WhatsApp/n8n) dan `staff_notification` (notifikasi staf). Keduanya ditandatangani HMAC-SHA256; aplikasi tidak mengirim email sama sekali.
- 12 tabel app termasuk `user_identities`, `oauth_transactions`, dan `auth_rate_limits`; journal migrasi pada schema drizzle.
- Google OIDC Authorization Code + PKCE/state/nonce; token session acak 256-bit dan SHA-256 token hash database.
- API Google start/callback, CSRF, logout, me; role/status/preapproval diperiksa server.
- CSRF signed double-submit dengan HMAC terikat session, expiry satu jam, cookie HttpOnly; bootstrap/refresh CSRF memakai GET /api/v1/auth/csrf.
- Rate limit atomik PostgreSQL: masing-masing start dan callback Google 100 permintaan/menit global. Header IP browser tidak dipercaya.
- Callback nyata belum dapat diuji sebelum Google OAuth client dibuat.

## Mulai di mesin baru

1. Jalankan npm install, lalu npm run backend:setup. Script membuat .env.backend.local, .env.migration.local, .env.local dengan secret acak; menolak overwrite file yang sudah ada. Tidak membuat akun pengguna.
2. Jalankan npm run backend:up. Semua port Compose bind 127.0.0.1. Data PostgreSQL berada pada named volume lelang-backend-dev_database.
3. Jalankan npm run db:migrate lalu npm run db:grant:local. Drizzle membaca .env.migration.local; grants script hanya menerima target development loopback port 15432 dan database lelang_properti_dev.
4. Buat OAuth 2.0 Client ID tipe Web application pada Google Cloud. Tambahkan exact redirect URI `http://localhost:3003/api/v1/auth/google/callback` untuk lokal. Isi `GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET` pada `.env.local`; jangan commit atau cetak secret.
5. Jalankan npm run dev -- --port 3003. `APP_BASE_URL` dan `GOOGLE_REDIRECT_URI` harus sama origin/path dengan konfigurasi Google. Produksi wajib HTTPS.
6. Jalankan npm run typecheck, npm run lint, npm run build. Buka `/login` untuk uji end-to-end setelah akun dipraotorisasi.

Jika environment sudah ada, merge manual tanpa mencetak secret. Jangan jalankan backend:setup ulang untuk rotasi password database: init.sh hanya berjalan pada volume kosong. Rotasi memerlukan ALTER ROLE dan update file environment yang disetujui.

npm run backend:down menghentikan service tanpa menghapus volume. Jangan memakai down -v kecuali sengaja ingin menghapus seluruh database development.

## Preapproval akun

Google account tidak otomatis mendapat akses. Untuk development lokal, bootstrap akun dengan CLI migration-role; command hanya menerima PostgreSQL `127.0.0.1:15432/lelang_properti_dev`.

```powershell
npm run user:approve -- --email anda@gmail.com --name "Nama Anda" --role admin
```

Ganti email dengan akun Google yang dipakai login. Setelah command sukses, ulangi login dari `/login`. `admin` untuk operator penuh; `editor` untuk pengelola listing. CLI lain: `npm run user:disable -- --email anda@gmail.com`, `npm run user:enable -- --email anda@gmail.com`, dan `npm run user:role -- --email anda@gmail.com --role editor`. Disable dan ganti role mencabut seluruh sesi aktif.

Login pertama hanya mengikat email Gmail atau Google Workspace dengan claim `hd` dan `email_verified=true`; email pihak ketiga memerlukan binding `sub` yang diverifikasi administrator secara terpisah. Login berikutnya memakai `sub`; perubahan email Google tidak memindahkan ownership. Jangan memberi role dari claim Google. `email_verified_at` mencatat waktu login terakhir dengan claim email verified, bukan proses verifikasi email milik aplikasi.

## Alur API

1. GET `/api/v1/auth/google/start` membuat transaksi 10 menit dan redirect ke Google dengan scope minimal `openid email`. Scope `profile` tidak diminta karena nama profil dikelola operator melalui CLI, bukan disinkronkan dari Google.
2. Google kembali ke exact `/api/v1/auth/google/callback`. Backend mengonsumsi state sekali pakai, memeriksa cookie browser, PKCE, nonce, signature, issuer, audience, expiry, email verification, lalu mencari profile yang dipraotorisasi. Bila email belum terdaftar tetapi otoritatif (Gmail atau Workspace dengan claim `hd`, `email_verified=true`, lowercase kanonik), backend membuat profile baru dengan role `buyer` (`defaultSignupRole`) dalam transaksi login yang sama, mencatat audit `auth.google.signup`, dan mengonsumsi rate limit signup global (20/jam) serta per-IP (3/jam). Email tidak otoritatif tetap harus dipraotorisasi.
3. Login sukses mengikat `sub` bila pertama kali, merotasi session browser, dan mengirim cookie HttpOnly. Access/refresh token Google tidak disimpan. Akun dengan role `editor`/`admin` diarahkan ke `/dashboard?welcome=1`; akun non-staf (owner/agent/buyer, termasuk buyer baru hasil signup) ke `/dashboard/account`; akun tanpa role ke `/access-request`. Tujuan redirect ditentukan server dari role, tidak pernah dari parameter query, untuk mencegah open redirect.
4. GET `/api/v1/me` membaca identitas dan role aplikasi.
5. GET `/api/v1/auth/csrf`, lalu POST `/api/v1/auth/logout` dengan `X-CSRF-Token` untuk mencabut session berjalan, atau POST `/api/v1/auth/logout-all` untuk mencabut seluruh session akun.
6. GET `/api/v1/me/sessions` menampilkan session aktif milik pemanggil (waktu masuk, aktivitas terakhir, expiry). `ip_hash` dan `user_agent_hash` disimpan sebagai HMAC dan tidak pernah dikembalikan ke client.

Maksimal lima session aktif per akun; session tertua dicabut otomatis saat batas terlampaui. `last_seen_at` diperbarui paling sering satu kali per lima menit agar tidak menulis pada setiap request.

Cookie Secure aktif pada origin HTTPS; localhost development dapat HTTP. CSRF berlaku satu jam dan dapat diperbarui tanpa memperpanjang expiry session delapan jam. Endpoint JSON membatasi body 8 KiB sebelum parsing.

Cookie session memakai `SameSite=Lax` karena redirect balik dari Google harus membawa cookie; cookie CSRF memakai `SameSite=Strict` agar token tidak ikut terkirim pada navigasi lintas situs. Perbedaan ini disengaja — jangan disamakan.

## Onboarding akun staf

Tidak ada halaman registrasi mandiri, dan itu disengaja. Google hanya memverifikasi identitas; hak akses diberikan operator melalui CLI pada database development loopback.

1. Operator menjalankan `npm run user:approve -- --email <email> --name <nama> --role admin|editor`. Perintah hanya menerima `DATABASE_MIGRATION_URL` pada `127.0.0.1:15432/lelang_properti_dev`.
2. User membuka `/login` dan menekan "Lanjutkan dengan Google" memakai alamat Google yang sama persis dengan email yang disetujui.
3. Login pertama mengikat `sub` Google ke profile tersebut secara permanen. Login berikutnya dicocokkan lewat `sub`, bukan email.
4. `npm run user:role` mengubah role, `npm run user:disable` menonaktifkan akun; keduanya mencabut seluruh session aktif akun itu.

Halaman `/dashboard/users` bersifat baca saja. Seluruh mutasi akun tetap melalui CLI oleh operator berwenang, sesuai aturan tidak membuat akun nyata tanpa target eksplisit.

## Izin database

Role runtime tidak mempunyai DDL atau role management. Runtime hanya dapat mengikat identity, mengelola transaksi OAuth/session/rate limit, dan memperbarui timestamp verifikasi. Role/status/profile preapproval memerlukan jalur admin terpisah. Migration URL tidak digunakan runtime.

## Verifikasi

`npm run test:auth` memakai PostgreSQL development nyata, route handler langsung, serta token RS256 sintetis. Transport Google dimock; signature/issuer/audience/expiry/nonce, state/browser/PKCE, replay, preapproval, binding sub, rotation, disabled account, logout/CSRF, dan rate limit diuji. Callback Google sungguhan tetap memerlukan uji browser setelah OAuth client tersedia. Jangan arahkan script development ke produksi.

scripts/verify-database.sql menguji insert/constraint/rollback pada database kosong. Runner SSH lama tetap utility opt-in untuk PostgreSQL mandiri dengan target eksplisit; tidak digunakan untuk setup lokal. Jangan jalankan SQL verifier pada data pengguna.

## Belum selesai / gate produksi

- CLI preapproval development lokal tersedia; API admin dapat membaca akun, tetapi pembuatan/perubahan role tetap memakai CLI migration-role. MFA dan revocation massal belum tersedia.
- Dashboard, katalog, detail, galeri, dan form minat memakai API v1 PostgreSQL. Data seed SQLite tidak lagi menjadi sumber katalog publik. Migrasi data/foto SQLite lama belum dibuat.
- Webhook notifikasi, transactional outbox, media verification worker, storage volume lokal, cleanup media, dead-letter listing/retry, metrics, backup lokal, dan restore test ephemeral tersedia.
- Rate limiter global merupakan guard awal: trafik multi-instance/produksi membutuhkan kebijakan quota dan cleanup key kadaluwarsa, alert spam, serta reverse proxy terpercaya.
- Audit domain dan login/logout sukses tersedia. Load smoke lokal 200 request concurrency 20 menghasilkan P95 379 ms pada 15 September 2026. MFA admin, HTTPS deployment nyata, backup terenkripsi lokasi kedua, alerting eksternal, dan load test staging representatif tetap gate rilis.
- Tidak ada perubahan ke server Supabase lama, gateway, atau database produksi.


## Operasi backend MVP — 15 September 2026

- API v1 tersedia untuk listing staf, workflow review/publish, katalog/detail publik, media karantina, lead, audit admin, dashboard, health, dan metrics. Endpoint lama `/api/properties` serta `/api/uploads/*` mengembalikan `410`; dashboard prototype belum dihubungkan otomatis agar perubahan frontend pengguna tidak tertimpa.
- Jalankan worker dengan `npm run worker:outbox -- --once` untuk satu batch atau tanpa `--once` untuk proses berkelanjutan. Worker memverifikasi media, mengirim event webhook yang dikonfigurasi, retry exponential, lalu memakai `dead_letter` setelah delapan kegagalan.
- `GET /api/v1/health/metrics` wajib header `Authorization: Bearer <METRICS_TOKEN>` dan tidak boleh diekspos publik. Endpoint menampilkan count listing publik, lead baru, outbox pending, dan dead letter.
- Backup development lokal: tetapkan `BACKUP_ROOT` ke path absolut privat di luar repository, lalu jalankan `npm run backup:local`. Jalankan `npm run test:restore` untuk restore ke PostgreSQL Docker ephemeral. Drill staging/produksi tetap wajib sebelum rilis.
- Validasi: `npm run typecheck`, `npm run lint`, `npm run db:check`, `npm test`, `npm run test:auth`, dan `npm run test:backend`. `npm test` menjalankan unit test `node:test` di `tests/unit/` tanpa database maupun Docker. `npm run test:backend` menjalankan unit test itu lebih dulu, lalu membuat container PostgreSQL ephemeral pada `127.0.0.1:25433`; tidak memakai volume development atau produksi.
- Konfigurasi environment divalidasi saat boot melalui `assertBootEnvironment()` di `src/instrumentation.ts` (scope `app`) dan `scripts/run-worker.ts` (scope `worker`, tanpa kredensial Google). Proses gagal cepat dan hanya menyebut nama variabel yang bermasalah, tidak pernah nilainya. Aturan origin, secret, dan `STORAGE_ROOT` terpusat di `src/server/env.ts`.
- `esbuild` dipin melalui `overrides` pada `@esbuild-kit/core-utils` karena `drizzle-kit@0.31.10` masih menarik `@esbuild-kit/esm-loader` lama. Jangan hapus override tanpa memastikan `npm audit` tetap nol dan `npm run db:check` lulus.
