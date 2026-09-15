# Aturan proyek

## CodeGraph

Jika repository memiliki .codegraph/, gunakan codegraph_explore sebelum grep atau membaca kode untuk memahami simbol/alur. Tanpa index, gunakan tools lokal; jangan membuat index tanpa permintaan pengguna.

## Keputusan backend — 15 September 2026

- Backend milik aplikasi, modular monolith Next.js Route Handlers dan TypeScript. Drizzle ORM/Kit mengelola PostgreSQL mandiri.
- Tidak memakai Supabase untuk database, Auth, Storage, Realtime, SDK, MCP, atau provisioning. Jangan mengakses atau mengubah instance lama untuk tugas backend ini.
- Auth hanya melalui Google OpenID Connect Authorization Code + PKCE, state, dan nonce. Google memverifikasi identitas; PostgreSQL aplikasi menyimpan `sub`, profil, role, dan opaque session token. Jangan memakai password lokal atau email sebagai identitas utama.
- Storage MVP memakai volume persisten terpisah dari public/ dan repository melalui StorageAdapter. Implementasi S3-compatible boleh ditambah lewat ADR; bukan dependency MVP.
- PostgreSQL, worker, SMTP adapter, dan rate limiter berada dalam kontrol aplikasi. Library standar diperbolehkan; layanan BaaS bukan bagian rancangan.
- Jangan menulis password/secret pada repo, output tool, log, atau dokumentasi. Role database runtime dan migrasi wajib berbeda; database tidak diekspos publik.
- Semua mutasi memerlukan policy server; mutasi sesi browser memerlukan perlindungan CSRF. Draft dan media karantina tidak boleh publik.
- Jangan ubah gateway/server, membuat akun nyata, menjalankan migrasi permanen, atau mengubah data produksi tanpa target eksplisit dan verifikasi.
- Pertahankan migrasi yang sudah diterapkan. Baseline belum dirilis hanya boleh dibuat ulang bila dipastikan belum dipakai database permanen; catat alasannya.
- Bedakan kode yang tersedia dari rancangan target dalam PRD, SDD, dan setup. Auth/login, storage, dan worker tidak dianggap selesai hanya karena tabel tersedia.
- Perubahan frontend pengguna tidak boleh ditimpa. Jangan commit/push tanpa permintaan.

Dokumen acuan: docs/PRD.md, docs/SDD.md, docs/backend-setup.md.
