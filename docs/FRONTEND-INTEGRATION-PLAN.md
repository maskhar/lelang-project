# Rancangan Frontend dan Integrasi — 15 September 2026

## Tujuan

Menyelesaikan frontend agar seluruh alur MVP memakai API v1 dan PostgreSQL: katalog, detail, minat, login, dashboard editor, review admin, lead, media, audit, outbox, dan akun. Backend tetap sumber kebenaran untuk role, validasi, version, status, serta publikasi.

## Prinsip

- Pertahankan visual serif, warna gelap/gold, layout katalog, dan perubahan desain yang sudah ada.
- Mobile-first, target sentuh minimal 44 px, navigasi keyboard, focus ring, dan kontras minimal 4.5:1.
- Semua mutasi mengambil CSRF dari GET /api/v1/auth/csrf lalu mengirim X-CSRF-Token.
- Semua edit membawa version. VERSION_CONFLICT membuka pilihan muat ulang; jangan menimpa otomatis.
- Loading, empty, error, forbidden, rate-limit, dan conflict mempunyai state berbeda.
- Draft, lead, audit, outbox, serta media pending tidak pernah dirender publik.

## Struktur Target

- src/components/api-client.ts: parser JSON, timeout UI, error API, dan mapping status.
- src/components/csrf.ts: helper CSRF untuk seluruh mutasi.
- src/components/property-form.tsx: form create/edit reusable.
- src/components/property-media-manager.tsx: upload, progress, reorder, delete, recovery rejected.
- src/components/status-badge.tsx: status listing, media, lead, dan outbox.
- src/app/dashboard/properties: daftar dan edit listing.
- src/app/dashboard/review: antrean review admin.
- src/app/dashboard/leads: inbox dan workflow lead.
- src/app/dashboard/audit: audit trail admin.
- src/app/dashboard/outbox: pending/dead-letter dan retry.
- src/app/dashboard/users: daftar akun, role, dan status.

## Halaman Publik

### Katalog

Gunakan GET /api/v1/properties dengan q, type, city, province, saleMode, availabilityStatus, minPrice, maxPrice, sort, limit, dan cursor. Search debounce 300 ms. Filter berubah harus reset cursor. Gunakan tombol Muat lebih banyak; cegah request ganda.

Kartu menampilkan cover, mode, lokasi, title, luas, harga acuan, dan deadline absolute. Jangan menampilkan jumlah bidder atau klaim bid tercatat.

### Detail

Gunakan GET /api/v1/properties/public/{slug}. Gallery hanya memakai media ready dari response dan /api/v1/media/{id}. 404 memakai notFound tanpa fallback SQLite. Reservasi aspect ratio gambar untuk mencegah layout shift.

### Form Minat

Gunakan POST /api/v1/leads. Wajib nama, consent, serta minimal email atau telepon. Tombol disabled saat submit. RATE_LIMITED menampilkan waktu tunggu. Setelah sukses, reset form tanpa menampilkan ID lead. Copy wajib menjelaskan form bukan bidding atau pembayaran.

## Login dan Akun

- /login mengarah ke GET /api/v1/auth/google/start.
- /account membaca GET /api/v1/me.
- Logout mengambil CSRF lalu POST /api/v1/auth/logout.
- Bedakan 401 login ulang dari 403 akun tidak disetujui/nonaktif.

## Dashboard Editor

### Daftar Properti

Buat src/app/dashboard/properties/page.tsx memakai GET /api/v1/admin/properties. Tampilkan title, lokasi, mode, status, version, update terakhir, dan aksi.

### Edit Properti

Buat src/app/dashboard/properties/[id]/page.tsx. Operasi:
- GET /api/v1/properties/{id}/detail.
- PATCH /api/v1/properties/{id} untuk revision baru.
- POST /api/v1/properties/{id}/media untuk upload.
- PATCH /api/v1/properties/{id}/media/manage untuk reorder/delete.
- POST /api/v1/properties/{id} action submit.

Tampilkan revision aktif, progress per file, status pending/ready/rejected, cover, dan recovery upload.

## Dashboard Admin

### Review

Buat src/app/dashboard/review/page.tsx. Filter pending_review dari GET /api/v1/admin/properties. Approve hanya aktif bila cover ready dan tidak ada media pending. Revision/reject/archive mewajibkan alasan.

### Lead

Buat src/app/dashboard/leads/page.tsx memakai GET /api/v1/leads/admin dan PATCH /api/v1/leads/admin/{id}. Tampilkan new, contacted, closed, spam. Mask email/telepon pada daftar.

### Audit

Buat src/app/dashboard/audit/page.tsx memakai GET /api/v1/admin/audit. Render actor, action, entity, timestamp, dan metadata tersaring. Jangan render token/cookie/secret.

### Outbox

Buat src/app/dashboard/outbox/page.tsx memakai GET/PATCH /api/v1/admin/outbox. Retry hanya untuk dead_letter dan wajib dialog konfirmasi.

### Users

Buat src/app/dashboard/users/page.tsx memakai GET /api/v1/admin/users. Pembuatan, role, disable, dan enable tetap lewat CLI migration-role; frontend tidak mengakali privilege runtime.

## Kontrak Error

- UNAUTHENTICATED: redirect /login; pertahankan input non-sensitif bila aman.
- FORBIDDEN: tampilkan akses ditolak.
- VALIDATION_ERROR: fokus field pertama yang gagal.
- VERSION_CONFLICT: dialog muat ulang revision.
- MEDIA_NOT_READY: tampilkan media pending/rejected.
- RATE_LIMITED: disable sementara dan tampilkan retry time.
- SERVICE_UNAVAILABLE: tampilkan retry tanpa menghapus input.

## Urutan Implementasi

### Fase A — Fondasi UI
API client, CSRF helper, async state, form error, status badge, dashboard shell. Selesai bila tidak ada request ad-hoc dan tidak ada SQLite untuk data domain.

### Fase B — Listing Editor
Daftar, detail, reusable form, upload progress, reorder/delete, conflict dialog. Selesai bila editor membuat, mengedit, mengelola 20 media, dan submit review tanpa terminal.

### Fase C — Operasi Admin
Review, lead, audit, outbox, users. Selesai bila lifecycle listing dan lead bisa dituntaskan melalui UI.

### Fase D — Publik dan Polish
Cursor pagination, URL-synced filter, gallery, lead UX, mobile, keyboard, copy legal. Selesai bila visitor mencari listing dan mengirim minat tanpa kebocoran draft.

### Fase E — E2E
Chromium E2E: mocked auth plus create, upload, submit, approve, catalog, lead, Mailpit. OAuth Google nyata tetap manual menggunakan akun preapproved.

## Gap Integrasi yang Harus Diselesaikan

- Katalog belum mengirim media cover; tambahkan coverMediaId atau media terpilih dalam query batch, bukan satu request detail per kartu.
- Antrean review tidak boleh hanya memfilter publicationStatus. Listing published dapat memiliki revision pending; expose latestRevisionStatus dan filter status revisi.
- Daftar staf/lead/audit/outbox masih dibatasi jumlah tetap; pagination, filter server, serta total count diperlukan sebelum data besar.
- UI statistik tidak boleh menyebut jumlah halaman pertama sebagai total; gunakan GET /api/v1/dashboard untuk agregasi DB.
- Upload gagal setelah create harus mempertahankan propertyId dan version terbaru. Retry melanjutkan draft yang sama, bukan membuat listing duplikat.
- Foto draft belum memiliki preview server terlindungi; sediakan endpoint staf dengan session/policy. Jangan membuat media pending dapat diakses publik.
- Edit membuat revisi baru; sepakati copy metadata/media ready ke revisi baru atau UX upload ulang secara eksplisit. Jangan mengubah media snapshot publik.
- Error field terstruktur dan kode rate limit perlu dinormalisasi; handler auth saat ini dapat mengembalikan LOGIN_RATE_LIMITED, bukan RATE_LIMITED.
- UI wajib menyediakan Simpan draft terpisah dari Kirim review; form tidak boleh otomatis submit ketika upload belum lengkap.
- Availability sold belum memiliki mutasi UI/API khusus. Jangan tampilkan aksi tandai terjual sebelum policy dan audit tersedia.
- MFA, migrasi SQLite, worker supervision, restore media, serta OAuth browser nyata tetap gate backend/operasional; rancangan frontend tidak menyatakan semuanya selesai.

## Strategi Verifikasi

- Unit: DTO mapping, timezone, harga rupiah, error parser, state recovery upload.
- Integration: 401/403, CSRF invalid, konflik versi dua editor, publikasi revisi, media pending/rejected, retry dead-letter.
- E2E terisolasi: visitor/editor/admin; email diarahkan Mailpit; akun sintetis hanya database test.
- Uji URL filter dan cursor lintas halaman dengan lebih dari 100 listing; reset cursor ketika filter berubah.
- Uji publikasi pertama serta revisi listing yang sudah published. Snapshot lama tetap tampil sampai approve.
- Visual QA: lebar 360, 768, dan 1440 px; focus keyboard; screen-reader status; tidak ada horizontal overflow.
- OAuth nyata dilakukan pemilik akun preapproved; tidak membuat akun Google atau melewati consent secara otomatis.
- Build dan typecheck dijalankan serial karena sama-sama memakai artefak .next.

## Definition of Done

- Semua data domain memakai API v1 dan PostgreSQL.
- Frontend tidak memanggil /api/properties atau /api/uploads/*.
- Semua mutasi memakai CSRF, loading guard, dan error state.
- Policy tetap di server; UI hanya mencerminkan role/status.
- Draft dan media privat tidak bocor.
- Mobile, keyboard, contrast, empty/error state diperiksa.
- Typecheck, lint, build, auth/backend/restore/load test lulus.
- Browser E2E tersedia; OAuth nyata dicatat dalam checklist manual.
