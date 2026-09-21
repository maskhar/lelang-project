-- Media library mengurutkan seluruh tabel dengan "order by created_at desc, id desc" lalu limit/offset
-- (lihat listMedia di src/server/media/library.ts). Tanpa index itu Seq Scan + Sort atas semua baris di
-- setiap permintaan halaman, dan biayanya naik seiring jumlah foto, bukan jumlah baris yang ditampilkan.
--
-- Kolom id ikut karena ia tiebreaker urutan itu: tanpa id di index, Postgres masih harus menyortir baris
-- dengan created_at sama. Arah desc ditulis eksplisit supaya cocok persis dengan ORDER BY querynya.
CREATE INDEX "property_media_created_idx" ON "app"."property_media" USING btree ("created_at" DESC,"id" DESC);
