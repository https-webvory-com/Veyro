import { encryptKey } from "../app/services/ai-settings.server.js";
/* eslint-env node */
/* global globalThis */
import test from "node:test";
import assert from "node:assert/strict";
import { handleDashboardAction as handleAction } from "../app/services/veyro.server.js";
import { analyzeImage } from "../app/services/vision.server.js";

const db = { imageReview: { findFirst() { throw new Error("Unexpected database read"); }, updateMany() { throw new Error("Unexpected database write"); } } };
const handleDashboardAction = (args) => handleAction({ ...args, db });

function form(intent, reviewId = "review-1") {
  const data = new FormData(); data.set("intent", intent); data.set("reviewId", reviewId); return data;
}
const review = { id: "review-1", mediaId: "gid://shopify/MediaImage/1", status: "pending", originalAlt: "Old description", generatedAlt: "Black dress" };

test("cannot approve another shop's review", async (t) => {
  t.mock.method(db.imageReview, "findFirst", async ({ where }) => {
    assert.deepEqual(where, { id: "review-1", shop: "other.myshopify.com" }); return null;
  });
  const result = await handleDashboardAction({ shop: "other.myshopify.com", admin: {}, formData: form("approve") });
  assert.equal(result.success, false);
});

test("rejects stale ALT and returns review to pending without writing Shopify", async (t) => {
  t.mock.method(db.imageReview, "findFirst", async () => review);
  const writes = [];
  t.mock.method(db.imageReview, "updateMany", async (args) => { writes.push(args); return { count: 1 }; });
  const calls = [];
  const admin = { graphql: async (query) => {
    calls.push(query);
    return Response.json({ data: { node: { id: review.mediaId, alt: "Merchant edit", fileStatus: "READY" } } });
  } };
  const result = await handleDashboardAction({ shop: "store.myshopify.com", admin, formData: form("approve") });
  assert.match(result.error, /changed in Shopify/);
  assert.equal(calls.length, 1);
  assert.equal(writes.at(-1).data.status, "pending");
});

test("Shopify userErrors never mark a review applied", async (t) => {
  t.mock.method(db.imageReview, "findFirst", async () => review);
  const writes = [];
  t.mock.method(db.imageReview, "updateMany", async (args) => { writes.push(args); return { count: 1 }; });
  const admin = { graphql: async (query) => Response.json({ data: query.includes("mutation")
    ? { fileUpdate: { files: [], userErrors: [{ message: "Missing write_files permission" }] } }
    : { node: { id: review.mediaId, alt: review.originalAlt, fileStatus: "READY" } } }) };
  const result = await handleDashboardAction({ shop: "store.myshopify.com", admin, formData: form("approve") });
  assert.match(result.error, /write_files/);
  assert.equal(writes.some((item) => item.data.status === "applied"), false);
});

test("approval sends merchant's edited ALT and records confirmed success", async (t) => {
  t.mock.method(db.imageReview, "findFirst", async () => review);
  const writes = [];
  t.mock.method(db.imageReview, "updateMany", async (args) => { writes.push(args); return { count: 1 }; });
  const data = form("approve"); data.set("generatedAlt", "A black evening dress");
  const admin = { graphql: async (query, { variables }) => {
    if (query.includes("mutation")) {
      assert.deepEqual(variables.files, [{ id: review.mediaId, alt: "A black evening dress" }]);
      return Response.json({ data: { fileUpdate: { files: [{ id: review.mediaId }], userErrors: [] } } });
    }
    return Response.json({ data: { node: { id: review.mediaId, alt: review.originalAlt, fileStatus: "READY" } } });
  } };
  const result = await handleDashboardAction({ shop: "store.myshopify.com", admin, formData: data });
  assert.equal(result.success, true);
  assert.equal(writes.at(-1).data.status, "applied");
});

test("dismiss does not call Shopify", async (t) => {
  t.mock.method(db.imageReview, "findFirst", async () => review);
  t.mock.method(db.imageReview, "updateMany", async ({ where, data }) => {
    assert.equal(where.shop, "store.myshopify.com"); assert.equal(data.status, "dismissed"); return { count: 1 };
  });
  const result = await handleDashboardAction({ shop: "store.myshopify.com", admin: {}, formData: form("dismiss") });
  assert.equal(result.success, true);
});

test("malformed AI output is rejected before saving suggestions", async (t) => {
  const oldSecret = process.env.SHOPIFY_API_SECRET; process.env.SHOPIFY_API_SECRET = "test-encryption-secret"; const oldKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_VISION_MODEL;
  process.env.OPENAI_API_KEY = "test-placeholder"; process.env.OPENAI_VISION_MODEL = "test-model";
  t.after(() => { if (oldSecret === undefined) delete process.env.SHOPIFY_API_SECRET; else process.env.SHOPIFY_API_SECRET = oldSecret;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_VISION_MODEL; else process.env.OPENAI_VISION_MODEL = oldModel;
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"color":"Black","confidence":150}' }] }] }));
  await assert.rejects(analyzeImage("https://cdn.shopify.com/test.jpg", ["Black"], { shop: "test", db: { aiConnection: { findUnique: async () => ({ model: "test-model", encryptedKey: encryptKey("test-placeholder", "test") }) } } }), /invalid color/);
});
