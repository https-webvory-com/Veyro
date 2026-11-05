import test from "node:test";
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { compressImage, optimizerOptions, publishOptimization } from "../app/services/optimizer.server.js";

const hash = (data) => createHash("sha256").update(data).digest("hex");
test("compression resizes JPEG, preserves PNG transparency, and never enlarges", async () => {
  const jpg = await sharp({ create: { width: 600, height: 400, channels: 3, background: "red" } }).jpeg().toBuffer();
  const smaller = await compressImage(jpg, { maxWidth: 320, quality: 80 });
  assert.equal(smaller.width, 320); assert.equal(smaller.mimeType, "image/jpeg");
  const png = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 0.5 } } }).png().toBuffer();
  const result = await compressImage(png, { maxWidth: 320, quality: 80 });
  assert.equal(result.width, 40); assert.equal((await sharp(result.bytes).metadata()).hasAlpha, true);
});
test("unsupported image formats are not silently converted", async () => {
  const webp = await sharp({ create: { width: 20, height: 20, channels: 3, background: "blue" } }).webp().toBuffer();
  await assert.rejects(compressImage(webp, { maxWidth: 320, quality: 80 }), /JPEG and PNG/);
});
test("compression inputs are bounded on the server", () => {
  const form = new FormData(); form.set("quality", "100"); form.set("maxWidth", "100000");
  assert.throws(() => optimizerOptions(form));
});
test("image replacement requires a persisted backup", async () => {
  const db = { imageOptimization: { findFirst: async () => ({ id: "image", status: "applying" }) } };
  await assert.rejects(publishOptimization({ job: { shop: "shop" }, payload: { optimizationId: "image" }, db }), /backup/);
});
test("changed originals cannot be overwritten", async () => {
  const original = Buffer.from("original"); const optimized = Buffer.from("optimized"); const writes = [];
  const row = { id: "image", mediaId: "media", status: "applying", originalData: original, optimizedData: optimized, originalHash: hash(original) };
  const db = { imageOptimization: { findFirst: async ({ where }) => { assert.equal(where.shop, "shop"); return row; }, updateMany: async (value) => writes.push(value) } };
  const admin = { graphql: async () => Response.json({ data: { node: { id: "media", fileStatus: "READY", originalSource: { url: "https://cdn.shopify.com/image" } } } }) };
  let replaced = false;
  await assert.rejects(publishOptimization({ job: { shop: "shop" }, payload: { optimizationId: "image" }, db, admin, assertActive: async () => {}, get: async () => ({ status: 200, body: Buffer.from("merchant replacement") }), replace: async () => { replaced = true; } }), /image changed/);
  assert.equal(replaced, false); assert.equal(writes.at(-1).data.status, "applying");
});
test("retry recognizes an already applied upload and does not upload again", async () => {
  const original = Buffer.from("original"); const optimized = Buffer.from("optimized"); const writes = [];
  const row = { id: "image", mediaId: "media", status: "applying", originalData: original, optimizedData: optimized, originalHash: hash(original) };
  const db = { imageOptimization: { findFirst: async () => row, updateMany: async (value) => writes.push(value) } };
  const admin = { graphql: async () => Response.json({ data: { node: { id: "media", fileStatus: "READY", originalSource: { url: "https://cdn.shopify.com/image" } } } }) };
  await publishOptimization({ job: { shop: "shop" }, payload: { optimizationId: "image" }, db, admin, assertActive: async () => {}, get: async () => ({ status: 200, body: optimized }), replace: async () => { throw new Error("Should not upload"); } });
  assert.equal(writes.at(-1).data.status, "applied"); assert.equal(writes.at(-1).data.appliedHash, hash(optimized));
});
