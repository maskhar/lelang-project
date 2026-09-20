-- Migrasi data (bukan skema): notifikasi email dimatikan total, worker versi baru tidak lagi
-- mengenali tipe event lama ("lead.created", "property.review", "access_request.reviewed" yang
-- dulu dikirim lewat SMTP). Baris pending/processing yang tersisa saat deploy ditutup di sini
-- supaya tidak dilempar ke dead_letter lewat "Unknown event." Baris dead_letter lama sengaja
-- dibiarkan sebagai riwayat.
UPDATE "app"."outbox_events"
SET "status" = 'processed', "processed_at" = now(), "last_error" = 'notifikasi email dihapus; event tidak lagi dikirim'
WHERE "type" IN ('lead.created', 'property.review', 'access_request.reviewed')
  AND "status" IN ('pending', 'processing');
