import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatBytes } from "../../src/lib/bytes";
import { classifyOrphans, orphanSampleLimit, type MediaRowRef, type StoredFileRef } from "../../src/server/media/orphans";

const file = (objectPath: string, sizeBytes = 1000, bucket: StoredFileRef["bucket"] = "public"): StoredFileRef =>
  ({ bucket, objectPath, sizeBytes, modifiedAt: "2026-09-21T00:00:00.000Z" });
const row = (objectPath: string, status: MediaRowRef["status"] = "ready", bucket = "public"): MediaRowRef =>
  ({ id: "row-" + objectPath, bucket, objectPath, status });

describe("formatBytes", () => {
  it("keeps small values in exact bytes", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1), "1 B");
    assert.equal(formatBytes(999), "999 B");
    assert.equal(formatBytes(1023), "1.023 B");
  });

  it("switches unit exactly at each 1024 boundary", () => {
    assert.equal(formatBytes(1024), "1 KB");
    assert.equal(formatBytes(1024 * 1024 - 1), "1.024 KB");
    assert.equal(formatBytes(1024 * 1024), "1 MB");
    assert.equal(formatBytes(1024 ** 3), "1 GB");
    assert.equal(formatBytes(1024 ** 4), "1 TB");
  });

  it("reports the measured storage total the same way du does", () => {
    assert.equal(formatBytes(510_699_332), "487 MB");
    assert.equal(formatBytes(396_361_728), "378 MB");
  });

  it("treats non-finite and negative input as zero instead of throwing", () => {
    assert.equal(formatBytes(Number.NaN), "0 B");
    assert.equal(formatBytes(Number.POSITIVE_INFINITY), "0 B");
    assert.equal(formatBytes(-5), "0 B");
  });
});

describe("classifyOrphans", () => {
  it("reports nothing when disk and database match", () => {
    const report = classifyOrphans([row("lp-01/01-a.webp")], [file("lp-01/01-a.webp")]);
    assert.equal(report.tanpaBaris.count, 0);
    assert.equal(report.menungguWorker.count, 0);
    assert.equal(report.sisaQuarantine.count, 0);
    assert.equal(report.fileHilang.count, 0);
  });

  it("flags a file with no row at all and sums its bytes", () => {
    const report = classifyOrphans([], [file("lp-01/01-a.webp", 2048)]);
    assert.equal(report.tanpaBaris.count, 1);
    assert.equal(report.tanpaBaris.bytes, 2048);
    assert.equal(report.tanpaBaris.sample[0].objectPath, "lp-01/01-a.webp");
    assert.equal(report.tanpaBaris.sample[0].mediaId, null);
  });

  // Regresi paling berbahaya: baris 'deleted' masih dipakai worker media.cleanup untuk menemukan path,
  // jadi file-nya tidak boleh pernah muncul di kelas yang punya tombol hapus.
  it("never puts a deleted-status file in the deletable class", () => {
    const report = classifyOrphans([row("lp-01/01-a.webp", "deleted")], [file("lp-01/01-a.webp", 4096)]);
    assert.equal(report.tanpaBaris.count, 0);
    assert.equal(report.menungguWorker.count, 1);
    assert.equal(report.menungguWorker.bytes, 4096);
    assert.equal(report.menungguWorker.sample[0].status, "deleted");
  });

  // Sejak 0016 revisi berbagi file fisik, jadi dua baris pada satu path adalah keadaan normal — keadaan yang
  // dulu tidak mungkin ada karena property_media_object_uidx. File hanya menunggu worker kalau SEMUA
  // barisnya deleted; satu baris hidup saja berarti file itu masih dipakai revisi lain.
  it("keeps a shared file out of menungguWorker while one row is still live", () => {
    const shared = [{ id: "lama", bucket: "public", objectPath: "lp-01/01-a.webp", status: "deleted" as const },
      { id: "baru", bucket: "public", objectPath: "lp-01/01-a.webp", status: "ready" as const }];
    const report = classifyOrphans(shared, [file("lp-01/01-a.webp", 4096)]);
    assert.equal(report.menungguWorker.count, 0);
    assert.equal(report.tanpaBaris.count, 0);
    assert.equal(report.fileHilang.count, 0);
  });

  it("flags a shared file as menungguWorker once every row is deleted", () => {
    const shared = [{ id: "lama", bucket: "public", objectPath: "lp-01/01-a.webp", status: "deleted" as const },
      { id: "baru", bucket: "public", objectPath: "lp-01/01-a.webp", status: "deleted" as const }];
    const report = classifyOrphans(shared, [file("lp-01/01-a.webp", 4096)]);
    assert.equal(report.menungguWorker.count, 1);
    assert.equal(report.menungguWorker.bytes, 4096);
  });

  it("flags an active row whose file vanished from disk", () => {
    const report = classifyOrphans([row("lp-01/01-a.webp"), row("lp-01/02-b.webp", "pending")], []);
    assert.equal(report.fileHilang.count, 2);
    assert.equal(report.tanpaBaris.count, 0);
  });

  it("ignores deleted and rejected rows when looking for missing files", () => {
    const report = classifyOrphans([row("lp-01/01-a.webp", "deleted"), row("lp-01/02-b.webp", "rejected")], []);
    assert.equal(report.fileHilang.count, 0);
  });

  it("classifies quarantine files separately whatever their row says", () => {
    const rows = [row("2026/09/21/a.jpg", "rejected", "quarantine")];
    const report = classifyOrphans(rows, [file("2026/09/21/a.jpg", 512, "quarantine"), file("2026/09/21/b.jpg", 256, "quarantine")]);
    assert.equal(report.sisaQuarantine.count, 2);
    assert.equal(report.sisaQuarantine.bytes, 768);
    assert.equal(report.tanpaBaris.count, 0);
  });

  it("does not accuse legacy date-based paths that still have a row", () => {
    const report = classifyOrphans([row("2024/01/01/x.webp")], [file("2024/01/01/x.webp")]);
    assert.equal(report.tanpaBaris.count, 0);
    assert.equal(report.fileHilang.count, 0);
  });

  it("matches on bucket as well as path, so the same path in two buckets is two files", () => {
    const report = classifyOrphans([row("a.webp")], [file("a.webp"), file("a.webp", 100, "quarantine")]);
    assert.equal(report.tanpaBaris.count, 0);
    assert.equal(report.sisaQuarantine.count, 1);
  });

  it("caps the sample list but keeps counting past the cap", () => {
    const files = Array.from({ length: orphanSampleLimit + 5 }, (_, index) => file("lp-01/" + index + ".webp", 10));
    const report = classifyOrphans([], files);
    assert.equal(report.tanpaBaris.count, orphanSampleLimit + 5);
    assert.equal(report.tanpaBaris.bytes, (orphanSampleLimit + 5) * 10);
    assert.equal(report.tanpaBaris.sample.length, orphanSampleLimit);
    assert.equal(report.tanpaBaris.sampleTruncated, true);
  });
});
