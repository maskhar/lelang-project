import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthorizationError, requireRole, type Actor } from "../../src/server/auth/actor";
import { assertListingAccess, denied, isAgentOnly, isBuyerOnly, isOwnerOnly, isStaff } from "../../src/server/properties/policy";
import { AuthHttpError } from "../../src/server/auth/http";

const actorWith = (...roles: Actor["roles"]): Actor => ({ profileId: "11111111-1111-4111-8111-111111111111", email: "actor@example.invalid", name: "Actor", avatarUrl: null, roles });
const admin = actorWith("admin");
const editor = actorWith("editor");
const owner = actorWith("owner");
const agent = actorWith("agent");
const buyer = actorWith("buyer");
const otherProfileId = "22222222-2222-4222-8222-222222222222";

describe("requireRole matrix", () => {
  const matrix: Array<{ allowed: Actor["roles"]; pass: Actor[]; fail: Actor[] }> = [
    { allowed: ["editor", "admin", "owner"], pass: [admin, editor, owner], fail: [agent, buyer] },
    { allowed: ["editor", "admin"], pass: [admin, editor], fail: [owner, agent, buyer] },
    { allowed: ["admin"], pass: [admin], fail: [editor, owner, agent, buyer] },
    { allowed: ["buyer"], pass: [buyer], fail: [admin, editor, owner, agent] },
    { allowed: ["agent"], pass: [agent], fail: [admin, editor, owner, buyer] },
    { allowed: ["admin", "editor", "owner", "agent", "buyer"], pass: [admin, editor, owner, agent, buyer], fail: [actorWith()] },
  ];
  for (const { allowed, pass, fail } of matrix) {
    it("allows only [" + allowed.join(", ") + "]", () => {
      for (const actor of pass) assert.equal(requireRole(actor, ...allowed), actor);
      for (const actor of fail) assert.throws(() => requireRole(actor, ...allowed), AuthorizationError);
    });
  }

  it("passes when actor holds any allowed role among several", () => {
    const multi = actorWith("buyer", "owner");
    assert.equal(requireRole(multi, "owner"), multi);
    assert.equal(requireRole(multi, "buyer"), multi);
    assert.throws(() => requireRole(multi, "admin"), AuthorizationError);
  });
});

describe("policy role classifiers", () => {
  it("isStaff covers editor and admin only", () => {
    assert.equal(isStaff(admin), true);
    assert.equal(isStaff(editor), true);
    assert.equal(isStaff(owner), false);
    assert.equal(isStaff(agent), false);
    assert.equal(isStaff(buyer), false);
  });

  it("isOwnerOnly excludes staff", () => {
    assert.equal(isOwnerOnly(owner), true);
    assert.equal(isOwnerOnly(actorWith("owner", "editor")), false);
    assert.equal(isOwnerOnly(actorWith("owner", "admin")), false);
    assert.equal(isOwnerOnly(buyer), false);
  });

  it("isBuyerOnly excludes staff", () => {
    assert.equal(isBuyerOnly(buyer), true);
    assert.equal(isBuyerOnly(actorWith("buyer", "admin")), false);
    assert.equal(isBuyerOnly(owner), false);
  });

  it("isAgentOnly true only for pure agent", () => {
    assert.equal(isAgentOnly(agent), true);
    assert.equal(isAgentOnly(actorWith("agent", "owner")), false);
    assert.equal(isAgentOnly(actorWith("agent", "buyer")), false);
    assert.equal(isAgentOnly(actorWith("agent", "editor")), false);
    assert.equal(isAgentOnly(actorWith("agent", "admin")), false);
  });
});

describe("assertListingAccess", () => {
  it("staff bypasses ownership", () => {
    assert.doesNotThrow(() => assertListingAccess(admin, { ownerId: null }));
    assert.doesNotThrow(() => assertListingAccess(editor, { ownerId: otherProfileId }));
  });

  it("owner passes only on own listing", () => {
    assert.doesNotThrow(() => assertListingAccess(owner, { ownerId: owner.profileId }));
    assert.throws(() => assertListingAccess(owner, { ownerId: otherProfileId }), (error: unknown) => error instanceof AuthHttpError && error.status === 403 && error.code === "PROPERTY_ACCESS_DENIED");
    assert.throws(() => assertListingAccess(owner, { ownerId: null }), AuthHttpError);
  });

  it("denied() builds 403 PROPERTY_ACCESS_DENIED", () => {
    const error = denied();
    assert.equal(error.status, 403);
    assert.equal(error.code, "PROPERTY_ACCESS_DENIED");
  });
});
