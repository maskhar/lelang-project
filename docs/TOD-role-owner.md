# TOD Role Tambahan dan Portal Pemilik

Tanggal: 17 September 2026

## Prioritas

1. Fondasi role `owner` dan `agent`.
2. Ownership listing melalui `properties.owner_id`.
3. Access request user Google baru.
4. Portal owner: daftar, tambah draft, detail, kirim review.
5. Workflow editor review dan admin approval.
6. Assignment agent.
7. Audit, notifikasi, hardening policy.

## Pekerjaan aktif

- [x] Tambah enum role `owner`, `agent`, dan `buyer`.
- [x] Izinkan bootstrap user memakai role baru.
- [x] Izinkan owner membuat listing.
- [x] Simpan owner listing saat owner membuat draft.
- [x] Migration `owner_id` pada tabel `properties` (`drizzle/0007_panoramic_jigsaw.sql`).
- [x] Policy edit listing berbasis ownership (`src/server/properties/policy.ts`, route detail/media/manage/thumbnail).
- [x] Page `/access-request`.
- [x] API access request dan approval admin.
- [x] Access request menerima role `buyer`.
- [x] Filter listing owner.

## Acceptance criteria

- Owner approved dapat login.
- Owner dapat membuat draft.
- Draft baru menyimpan `owner_id` sesuai actor.
- Editor/admin tetap dapat membuat listing.
- Agent belum mendapat akses sebelum assignment tersedia.
- Semua mutasi memakai CSRF, session, dan policy server.
- Migration baru tidak mengubah migration yang sudah diterapkan.


## Gap setelah penambahan buyer

- [x] Aktifkan dashboard buyer berbasis riwayat minat.
- [x] Tambah watchlist buyer: schema, API, dan dashboard page.
- [x] Pisahkan role akses dashboard internal dari buyer/owner/agent.
- [x] Policy lead: buyer hanya melihat minat miliknya; owner hanya lead listing miliknya; agent belum aktif sebelum assignment.
- [x] Hubungkan status approval access request dengan notifikasi (email outbox). Forced re-login tidak diperlukan — `getAuthenticatedActor()` re-query role tiap request.
- [x] Tambah audit log approval/rejection access request (sudah tertulis sejak awal di `admin/access-requests` PATCH; checklist sebelumnya salah tandai).
- [x] Tambah assignment agent ke listing.
- [x] Tambah review workflow editor dan approval publikasi admin.
- [x] Tambah test authorization untuk setiap role (`tests/unit/authorization.test.ts`).
- [x] Tambah duplicate prevention access request.
- [x] Tambah rate limit access request.
- [x] Tambah consent, data privacy, dan penghapusan akun.

## Perubahan berikutnya

1. Buyer dashboard dan riwayat lead.
2. Policy ownership dan assignment agent.
3. Audit access request dan notifikasi.
4. Review/editor workflow.
5. Authorization test matrix.

## Review 17 September 2026

Selesai: role buyer, access request, callback Google tanpa role, duplicate prevention, audit access request, ownership filter listing.

Belum selesai: dashboard buyer, watchlist, lead policy per actor, assignment agent, editor review workflow, authorization matrix, privacy consent/export/delete, rate limit access request.

Validasi terakhir: `npm run lint` dan `npm test` lulus. `npm run typecheck` masih gagal pada perubahan lokal yang sudah ada di `src/app/api/v1/properties/[id]/media/route.ts:40`; opsi `opacity` tidak didukung tipe `OverlayOptions`.

Catatan susulan: typecheck sudah lulus. `opacity` dipindah menjadi atribut SVG pada watermark, bukan opsi `OverlayOptions`.

## Review 17 September 2026

Selesai batch: `buyer_id` pada lead, binding buyer login ke lead, endpoint lead memakai policy actor, owner lead filter, migration `0010_bouncy_stepford_cuckoos.sql`.

Belum: watchlist buyer, agent assignment, editor workflow, authorization matrix, rate limit access request, privacy consent/export/delete, notification.

## Review 17 September 2026 (batch policy ownership)

Selesai batch: modul `src/server/properties/policy.ts` sebagai sumber tunggal policy; owner kini dapat membuka detail, unggah foto, mengurutkan foto, dan memuat thumbnail listing miliknya; kebocoran lead untuk role `agent` ditutup (`dashboardLeads` mengembalikan daftar kosong sebelum assignment tersedia); nav dashboard dipisah per role (staff/owner/buyer/admin); gate server per segmen via `role-gate.tsx` dan `layout.tsx` pada `properties`, `review`, `watchlist`, `leads`, `access-requests`; rate limit access request (global 100/menit, 5/jam per profil); pengajuan akses kini dapat dikirim user tanpa role dan duplikat dikembalikan sebagai 409 `REQUEST_PENDING` di dalam transaksi; test matrix authorization `tests/unit/authorization.test.ts` (14 test).

Validasi: `npm run lint`, `npm run typecheck`, `npm test` (37 test) lulus. `npm run test:backend` exit 0; masih mencetak error sharp "Image to composite must have same dimensions or smaller" dari `src/workers/process-media.ts` untuk foto lebih kecil dari lebar watermark — pre-existing, belum diperbaiki di batch ini.

Belum: assignment agent, editor review workflow, notifikasi approval dan forced re-login, privacy consent/export/delete.

## Review 17 September 2026 (fix login Google 503 dan logo blur)

Bug: login Google asli (bukan callback dengan code palsu) selalu balas 503 `AUTH_UNAVAILABLE`. Sebab: `loginWithGoogle` (`src/server/auth/service.ts`) meng-update kolom `profiles.name` dan `profiles.avatar_url`, tapi `scripts/grant-runtime.sql` hanya memberi `UPDATE` pada `updated_at, email_verified_at`. Query gagal dengan "permission denied for table profiles", error generik ini jatuh ke fallback 503 di `authErrorResponse`. Fix: tambah `name, avatar_url` ke grant kolom, jalankan ulang `npm run db:grant:local`. Diverifikasi langsung ke Postgres dev: UPDATE keempat kolom sukses setelah grant baru.

Sekalian: logo header `/login` blur karena `sizes="80px"` pada `<Image>` tidak cocok dengan lebar tampilan CSS 150px (`login.module.css` `.headerBrand img{width:150px}`) sehingga Next.js mengirim varian gambar terlalu kecil lalu di-upscale. Fix: `sizes="150px"` (`src/app/login/page.tsx`). Diverifikasi via browser preview: naturalWidth/cssWidth rasio 1.00 pada DPR 1.

Belum diverifikasi end-to-end dengan akun Google asli (butuh akun approved); perbaikan divalidasi via inspeksi grant Postgres langsung dan reproduksi manual jalur `start` → `callback`.

## Review 17 September 2026 (batch penutup: grant, assignment, review workflow, notifikasi, privasi)

Akar masalah lanjutan: bug grant pada login Google ternyata bukan kasus tunggal. Audit `information_schema.table_privileges` untuk role `lelang_app` menunjukkan `access_requests`, `property_assignments`, `property_watchlists`, dan `user_roles` hanya punya `SELECT`, padahal aplikasi melakukan INSERT/UPDATE/DELETE pada keempatnya. Efeknya empat fitur yang sudah ditandai selesai (kirim pengajuan akses, approve access request yang memberi role, tambah/hapus watchlist, buat assignment agent) diam-diam gagal dengan 503 lewat fallback generik. Perlu dicatat ada dua fallback yang sama-sama menyamarkan error ini: `authErrorResponse` (`src/server/auth/http.ts`) untuk rute `/api/v1/auth/*` dan `apiErrorResponse` (`src/server/api.ts`) untuk sisanya. Fix: `scripts/grant-runtime.sql` diperluas per tabel, dijalankan ulang via `npm run db:grant:local`.

Assignment agent: `src/app/api/v1/admin/assignments/route.ts` ditambah guard duplikat, validasi role agent, audit `assignment.created`, dan DELETE unassign dengan audit `assignment.removed`. UI `/dashboard/assignments` dibuat dari nol (sebelumnya direktori kosong walau rute API sudah ada). `dashboardLeads` untuk agent tidak lagi mengembalikan daftar kosong, melainkan join EXISTS ke `property_assignments` aktif. PATCH `leads/admin/[id]` kini menerima role `agent` dengan cek kepemilikan assignment. Agent sebelumnya tidak punya akses dashboard sama sekali (`dashboard/layout.tsx` mengecualikan role tersebut) — diperbaiki.

Review workflow: state machine `transitionListing` sudah lengkap dan benar; masalahnya di UI — `ListingReview` menampilkan kelima tombol untuk semua role, sedangkan approve/revision/reject/archive admin-only di server, sehingga editor selalu dapat 403. Sesuai keputusan, diambil perbaikan UI-only: prop `isAdmin` menyaring tombol admin. `/api/v1/auth/session` kini mengembalikan `roles` agar klien bisa menentukan ini.

Notifikasi approval: tipe outbox baru `access_request.reviewed` di-insert pada PATCH access request, dikirim `src/workers/deliver-outbox.ts`. Ini event pertama yang mengirim email ke end-user (pemohon), bukan hanya staf internal.

Privasi: `GET /api/v1/account/export` (unduh JSON data akun, audit `account.exported`) dan `POST /api/v1/account/delete` (konfirmasi ketik "HAPUS AKUN", cabut sesi, hapus identitas/role, anonimkan profil, audit `account.deleted`). Penghapusan sengaja berupa soft-delete/anonimisasi agar FK dari `properties`, `leads`, `audit_logs`, dan `property_assignments` ke `profiles.id` tetap utuh. UI di `/dashboard/account`; `kebijakan-privasi` §11 diperbarui.

