import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unreferencedPaths, type PathRef } from "../../src/server/media/refcount";

const ref = (objectPath: string, bucket = "public"): PathRef => ({ bucket, objectPath });
const paths = (files: PathRef[]) => files.map((file) => file.bucket + ":" + file.objectPath).sort();

describe("unreferencedPaths", () => {
  it("menolak menghapus path yang masih dipakai baris lain", () => {
    // Regresi paling berbahaya sejak 0016: revisi lama dan revisi baru menunjuk file yang sama, jadi
    // menghapus foto di satu revisi tidak boleh menghilangkan foto revisi lain.
    const result = unreferencedPaths([ref("lp-1/01-a.webp")], [ref("lp-1/01-a.webp")]);
    assert.deepEqual(result, []);
  });

  it("menghapus path yang seluruh pemakainya ikut terhapus", () => {
    const result = unreferencedPaths([ref("lp-1/01-a.webp"), ref("lp-1/02-b.webp")], [ref("lp-2/01-c.webp")]);
    assert.deepEqual(paths(result), ["public:lp-1/01-a.webp", "public:lp-1/02-b.webp"]);
  });

  it("menghitung path duplikat sekali saja", () => {
    // 6 revisi yang menunjuk 1 foto menghasilkan 6 entri identik; unlink cukup sekali.
    const removed = Array.from({ length: 6 }, () => ref("lp-1/01-a.webp"));
    assert.deepEqual(unreferencedPaths(removed, []), [ref("lp-1/01-a.webp")]);
  });

  it("baris berstatus deleted di revisi lain tetap dihitung sebagai pemakai", () => {
    // Pemanggil menyertakan baris deleted ke dalam `remaining`: selama barisnya ada, worker media.cleanup
    // masih butuh path-nya, jadi file belum boleh hilang.
    const result = unreferencedPaths([ref("lp-1/01-a.webp")], [ref("lp-1/01-a.webp")]);
    assert.deepEqual(result, []);
  });

  it("membedakan bucket: path sama di public dan quarantine adalah dua file", () => {
    const result = unreferencedPaths([ref("x/01.webp", "public"), ref("x/01.webp", "quarantine")], [ref("x/01.webp", "public")]);
    assert.deepEqual(result, [ref("x/01.webp", "quarantine")]);
  });

  it("daftar kosong menghasilkan daftar kosong", () => {
    assert.deepEqual(unreferencedPaths([], [ref("lp-1/01-a.webp")]), []);
  });

  it("tidak mengembalikan objek yang sama dengan masukan (tidak ada alias tak terduga)", () => {
    const input = ref("lp-1/01-a.webp");
    const [output] = unreferencedPaths([input], []);
    assert.notEqual(output, input);
    assert.deepEqual(output, input);
  });
});
