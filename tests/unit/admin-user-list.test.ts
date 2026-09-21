import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUserListQuery, roleSortRank, userRoleFilters, userSortKeys } from "../../src/server/auth/admin-user-list";
import { manageableRoles } from "../../src/server/auth/admin-users";
import { AuthHttpError } from "../../src/server/auth/http";

const invalidQuery = (error: unknown) => error instanceof AuthHttpError && error.status === 422 && error.code === "INVALID_QUERY";

describe("parseUserListQuery", () => {
  it("tanpa parameter apa pun memakai urutan email dan tidak memfilter", () => {
    assert.deepEqual(parseUserListQuery({}), { status: undefined, role: undefined, sort: "email" });
  });

  it("menerima setiap status akun, role, dan kunci urutan yang ditawarkan UI", () => {
    for (const status of ["active", "disabled"]) assert.equal(parseUserListQuery({ status }).status, status);
    for (const role of userRoleFilters) assert.equal(parseUserListQuery({ role }).role, role);
    for (const sort of userSortKeys) assert.equal(parseUserListQuery({ sort }).sort, sort);
  });

  // Nilai asing harus berhenti di sini: diteruskan ke Postgres ia menjadi "invalid input value for enum"
  // dan keluar sebagai 503 seolah layanannya rusak, bukan querynya yang salah.
  it("menolak status di luar enum app.user_status", () => {
    assert.throws(() => parseUserListQuery({ status: "dead_letter" }), invalidQuery);
    assert.throws(() => parseUserListQuery({ status: "ACTIVE" }), invalidQuery);
  });

  it("menolak role dan urutan yang tidak dikenal", () => {
    assert.throws(() => parseUserListQuery({ role: "superadmin" }), invalidQuery);
    assert.throws(() => parseUserListQuery({ sort: "createdAt" }), invalidQuery);
    assert.throws(() => parseUserListQuery({ sort: "email desc" }), invalidQuery);
  });

  it("string kosong dibaca sebagai tanpa filter, bukan nilai tidak valid", () => {
    assert.deepEqual(parseUserListQuery({ status: "", role: "", sort: "" }), { status: undefined, role: undefined, sort: "email" });
  });
});

describe("filter role daftar akun", () => {
  it("mencakup kelima role yang bisa dikelola ditambah kelompok tanpa role", () => {
    assert.deepEqual([...userRoleFilters], [...manageableRoles, "tanpa_role"]);
  });

  // Kalau role baru ditambahkan ke enum tapi lupa diberi peringkat, sort role akan menaruhnya di kelompok
  // "tanpa role" (99) secara diam-diam. Test ini yang memaksa peringkatnya ikut diperbarui.
  it("setiap role yang bisa dikelola punya peringkat urut yang unik", () => {
    const ranks = manageableRoles.map((role) => roleSortRank[role]);
    assert.equal(ranks.filter((rank) => typeof rank === "number").length, manageableRoles.length);
    assert.equal(new Set(ranks).size, manageableRoles.length);
  });

  it("admin diurutkan sebelum owner, editor, agent dan buyer", () => {
    assert.deepEqual([...manageableRoles].sort((a, b) => roleSortRank[a] - roleSortRank[b]), ["admin", "owner", "editor", "agent", "buyer"]);
  });

  // Akun tanpa role dapat 99 di query, bukan NULL: pada ASC, NULL justru jatuh di akhir di Postgres
  // tetapi angka eksplisit membuat urutannya sama di kedua arah dan tidak bergantung NULLS FIRST/LAST.
  it("peringkat role selalu di bawah nilai akun tanpa role", () => {
    for (const role of manageableRoles) assert.ok(roleSortRank[role] < 99, role + " harus lebih kecil dari 99");
  });
});
