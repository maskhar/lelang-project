import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultSignupRole, isProvisionableEmail, profileNameFromIdentity } from "../../src/server/auth/identity";

describe("profileNameFromIdentity", () => {
  it("memakai claim name Google yang sudah di-trim", () => {
    assert.equal(profileNameFromIdentity({ name: "  Budi Santoso  ", email: "budi@gmail.com" }), "Budi Santoso");
  });
  it("jatuh ke local-part email saat name kosong atau hanya spasi", () => {
    assert.equal(profileNameFromIdentity({ email: "budi.s@gmail.com" }), "budi.s");
    assert.equal(profileNameFromIdentity({ name: "   ", email: "budi.s@gmail.com" }), "budi.s");
  });
  it("memotong ke 120 karakter sesuai varchar(120) profiles.name", () => {
    const long = "x".repeat(200);
    assert.equal(profileNameFromIdentity({ name: long, email: "a@gmail.com" }).length, 120);
    assert.equal(profileNameFromIdentity({ email: long + "@gmail.com" }).length, 120);
  });
  it("tidak pernah menghasilkan string kosong", () => {
    assert.equal(profileNameFromIdentity({ email: "@gmail.com" }), "Pengguna");
  });
});

describe("isProvisionableEmail", () => {
  it("menerima email kanonik huruf kecil", () => {
    assert.equal(isProvisionableEmail("budi.santoso+lelang@gmail.com"), true);
    assert.equal(isProvisionableEmail("staff@perusahaan.co.id"), true);
  });
  it("menolak email non-kanonik agar CHECK profiles_email_canonical tidak pernah ditabrak", () => {
    assert.equal(isProvisionableEmail("Budi@gmail.com"), false);
    assert.equal(isProvisionableEmail("budi@Gmail.com"), false);
  });
  it("menolak bentuk yang bukan email atau di luar batas varchar(320)", () => {
    for (const bad of ["", "a@b", "budi@", "@gmail.com", "bu di@gmail.com", "budi@gmail", "budi@@gmail.com", "x".repeat(320) + "@gmail.com"]) {
      assert.equal(isProvisionableEmail(bad), false, bad);
    }
  });
});

describe("defaultSignupRole", () => {
  it("adalah buyer — bukan role staf, dan bukan turunan claim Google", () => {
    assert.equal(defaultSignupRole, "buyer");
  });
});
