import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSessionToken, hashAuthToken, hasMatchingToken } from "../../src/server/auth/session";

describe("session", () => {
  it("creates 43-char base64url tokens", () => {
    for (let index = 0; index < 20; index++) assert.match(createSessionToken(), /^[A-Za-z0-9_-]{43}$/);
  });

  it("matches token against its own hash only", () => {
    const token = createSessionToken();
    assert.equal(hasMatchingToken(token, hashAuthToken(token)), true);
    assert.equal(hasMatchingToken(createSessionToken(), hashAuthToken(token)), false);
    assert.equal(hasMatchingToken(token, "ab"), false);
  });
});
