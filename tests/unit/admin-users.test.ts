import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertNoSelfLockout, manageableRoles } from "../../src/server/auth/admin-users";
import { type Actor } from "../../src/server/auth/actor";
import { AuthHttpError } from "../../src/server/auth/http";

const actorWith = (...roles: Actor["roles"]): Actor => ({ profileId: "11111111-1111-4111-8111-111111111111", email: "actor@example.invalid", name: "Actor", avatarUrl: null, roles });
const admin = actorWith("admin");
const otherId = "22222222-2222-4222-8222-222222222222";
const selfLockout = (error: unknown) => error instanceof AuthHttpError && error.status === 422 && error.code === "SELF_LOCKOUT";

describe("manageableRoles", () => {
  it("mencakup kelima role enum app.user_role", () => {
    assert.deepEqual([...manageableRoles], ["editor", "admin", "owner", "agent", "buyer"]);
  });
});

describe("assertNoSelfLockout", () => {
  it("menolak admin mencabut role admin miliknya sendiri", () => {
    assert.throws(() => assertNoSelfLockout(admin, admin.profileId, { role: "admin", grant: false }), selfLockout);
  });
  it("menolak admin menonaktifkan akunnya sendiri", () => {
    assert.throws(() => assertNoSelfLockout(admin, admin.profileId, { status: "disabled" }), selfLockout);
  });
  it("mengizinkan aksi yang sama terhadap akun lain", () => {
    assert.doesNotThrow(() => assertNoSelfLockout(admin, otherId, { role: "admin", grant: false }));
    assert.doesNotThrow(() => assertNoSelfLockout(admin, otherId, { status: "disabled" }));
  });
  it("mengizinkan aksi non-destruktif pada akun sendiri", () => {
    assert.doesNotThrow(() => assertNoSelfLockout(admin, admin.profileId, { role: "editor", grant: true }));
    assert.doesNotThrow(() => assertNoSelfLockout(admin, admin.profileId, { role: "editor", grant: false }));
    assert.doesNotThrow(() => assertNoSelfLockout(admin, admin.profileId, { role: "admin", grant: true }));
    assert.doesNotThrow(() => assertNoSelfLockout(admin, admin.profileId, { status: "active" }));
  });
});
