-- Revisi sekarang berbagi file fisik: editListing() tidak lagi memanggil copyPublic() untuk menggandakan
-- setiap foto ke revisi baru. Index unik pada (bucket, object_path) adalah satu-satunya penghalangnya —
-- dulu ia memaksa satu file per baris, sehingga 52 properti dengan 154 revisi memakan 1663 file di disk
-- untuk hanya 534 isi gambar yang benar-benar berbeda (510 MB, seharusnya 170 MB).
--
-- Index tetap dibuat ulang sebagai non-unik, bukan dibuang: penjaga penghapusan fisik
-- (discardIfUnreferenced) menanyai (bucket, object_path) setiap kali file akan dihapus, jadi lookup ini
-- justru lebih sering dipakai daripada sebelumnya. Keunikan pindah dari constraint DB ke pemeriksaan
-- referensi itu; refcount sengaja dihitung on-demand, tidak disimpan sebagai kolom, karena
-- property_media.revision_id memakai ON DELETE CASCADE sehingga baris bisa hilang tanpa melewati kode
-- aplikasi dan angka tersimpan apa pun pasti bocor.
DROP INDEX "app"."property_media_object_uidx";
--> statement-breakpoint
CREATE INDEX "property_media_object_idx" ON "app"."property_media" USING btree ("bucket","object_path");
