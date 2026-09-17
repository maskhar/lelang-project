import assert from "node:assert/strict";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseStorageRoot, parseAuthOrigin, assertBootEnvironment } from "../../src/server/env";
import { verifyImage, mediaMaxBytes } from "../../src/server/storage/local";

const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const png = Buffer.concat([pngHeader, Buffer.alloc(16)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)]);

describe("verifyImage", () => {
  it("accepts valid magic bytes per type", () => {
    assert.equal(verifyImage(png, "image/png"), true);
    assert.equal(verifyImage(jpeg, "image/jpeg"), true);
    assert.equal(verifyImage(webp, "image/webp"), true);
  });

  it("rejects mismatched type, unknown type, and oversize", () => {
    assert.equal(verifyImage(png, "image/jpeg"), false);
    assert.equal(verifyImage(png, "image/gif"), false);
    assert.equal(verifyImage(Buffer.alloc(4), "image/png"), false);
    assert.equal(verifyImage(Buffer.concat([pngHeader, Buffer.alloc(mediaMaxBytes)]), "image/png"), false);
  });
});

describe("parseStorageRoot", () => {
  it("rejects relative, empty, and in-repo paths", () => {
    assert.throws(() => parseStorageRoot(undefined), /STORAGE_ROOT/);
    assert.throws(() => parseStorageRoot("./data/storage"), /absolut/);
    assert.throws(() => parseStorageRoot(path.join(process.cwd(), "data")), /dalam repository/);
    assert.throws(() => parseStorageRoot(process.cwd()), /dalam repository/);
  });

  it("accepts an absolute path outside the repository", () => {
    const outside = path.resolve(process.cwd(), "..", "lelang-storage-test");
    assert.equal(parseStorageRoot(outside), path.normalize(outside));
  });
});

describe("parseAuthOrigin", () => {
  it("allows http only on loopback", () => {
    assert.equal(parseAuthOrigin("http://localhost:3000").secure, false);
    assert.equal(parseAuthOrigin("https://app.example.com").secure, true);
    assert.throws(() => parseAuthOrigin("http://app.example.com"), /HTTPS/);
    assert.throws(() => parseAuthOrigin("https://user:pass@app.example.com"), /HTTPS/);
    assert.throws(() => parseAuthOrigin("ftp://localhost"), /HTTPS/);
  });
});

describe("assertBootEnvironment", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("names every missing variable at once", () => {
    for (const key of ["DATABASE_URL", "APP_BASE_URL", "AUTH_CSRF_SECRET", "AUTH_RATE_LIMIT_SECRET", "STORAGE_ROOT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"]) delete process.env[key];
    assert.throws(() => assertBootEnvironment("app"), (error: Error) => {
      assert.match(error.message, /DATABASE_URL/);
      assert.match(error.message, /STORAGE_ROOT/);
      assert.match(error.message, /GOOGLE_CLIENT_ID/);
      assert.doesNotMatch(error.message, /[a-f0-9]{64}/);
      return true;
    });
  });

  it("worker scope ignores Google and auth secrets", () => {
    for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "AUTH_CSRF_SECRET"]) delete process.env[key];
    process.env.DATABASE_URL = "postgresql://user@127.0.0.1:5432/db";
    process.env.STORAGE_ROOT = path.resolve(process.cwd(), "..", "lelang-storage-test");
    assert.doesNotThrow(() => assertBootEnvironment("worker"));
  });
});
