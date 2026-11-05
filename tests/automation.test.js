import test from "node:test";
import assert from "node:assert/strict";
import { automationSettings, canAutoApprove, imageFingerprint, processProduct, handleAutomation } from "../app/services/automation.server.js";
import { matchingEmptyVariants, assignMatchingVariants } from "../app/services/variants.server.js";
import { enqueue, claimJob, runOneJob } from "../app/services/queue.server.js";

test("automatic approval needs opt-in, exact match, high confidence, and empty ALT", () => {
  const review = { matchedColor: "Black", confidence: 99, originalAlt: "" };
  const settings = { autoApprove: true, confidenceThreshold: 95 };
  assert.equal(canAutoApprove(review, settings), true);
  assert.equal(canAutoApprove({ ...review, originalAlt: "Merchant text" }, settings), false);
  assert.equal(canAutoApprove({ ...review, confidence: 94 }, settings), false);
  assert.equal(canAutoApprove({ ...review, matchedColor: null }, settings), false);
  assert.equal(canAutoApprove(review, { ...settings, autoApprove: false }), false);
});
test("auto approval settings reject a low threshold", () => {
  const data = new FormData(); data.set("altTemplate", "[Product Title]"); data.set("confidenceThreshold", "80"); data.set("autoApprove", "on");
  assert.throws(() => automationSettings(data), /at least 95/);
  data.set("confidenceThreshold", "95"); assert.equal(automationSettings(data).autoApprove, true);
});
test("fingerprints ignore ALT to prevent webhook feedback loops", () => {
  const product = { title: "Dress", options: [] };
  const image = { image: { url: "https://cdn.shopify.com/a.jpg" }, alt: "" };
  const before = imageFingerprint(product, image, "[Product Title]");
  assert.equal(before, imageFingerprint(product, { ...image, alt: "new ALT" }, "[Product Title]"));
  assert.notEqual(before, imageFingerprint({ ...product, title: "New title" }, image, "[Product Title]"));
});
test("variant matching covers sizes and preserves assigned images", () => {
  const variants = [
    { id: "small", selectedOptions: [{ name: "Color", value: "Black" }, { name: "Size", value: "S" }], media: { nodes: [] } },
    { id: "large", selectedOptions: [{ name: "Colour", value: "black" }, { name: "Size", value: "L" }], media: { nodes: [] } },
    { id: "existing", selectedOptions: [{ name: "Color", value: "Black" }], media: { nodes: [{ id: "image" }] } },
    { id: "blue", selectedOptions: [{ name: "Color", value: "Navy" }], media: { nodes: [] } },
  ];
  assert.deepEqual(matchingEmptyVariants(variants, "Black").map((variant) => variant.id), ["small", "large"]);
});
test("variant assignment rejects media outside the product before mutation", async () => {
  const admin = { graphql: async (query) => { assert.equal(query.includes("mutation"), false); return Response.json({ data: { product: { media: { nodes: [], pageInfo: { hasNextPage: false } } } } }); } };
  await assert.rejects(assignMatchingVariants({ admin, review: { productId: "p", mediaId: "m", matchedColor: "Black", confidence: 99 } }), /no longer belongs/);
});
test("webhook delivery dedupe returns existing job", async () => {
  const db = { workJob: { create: async () => { const error = new Error("duplicate"); error.code = "P2002"; throw error; }, findUnique: async ({ where }) => ({ id: where.dedupeKey }) } };
  assert.equal((await enqueue({ shop: "shop", kind: "product", dedupeKey: "event-1" }, db)).id, "event-1");
});
test("a competing worker cannot claim the same queued job", async () => {
  const db = { workJob: { findFirst: async () => ({ id: "job", status: "queued", attempts: 0, leaseToken: null }), updateMany: async () => ({ count: 0 }) } };
  assert.equal(await claimJob(db), null);
});
test("expired leases exhaust retries rather than running forever", async () => {
  let result;
  const db = { workJob: { findFirst: async () => ({ id: "job", status: "running", attempts: 3 }), updateMany: async (args) => { result = args; return { count: 1 }; } } };
  assert.equal(await claimJob(db), null); assert.equal(result.data.status, "failed");
});
test("worker isolates the stored shop and backs off after handler failure", async () => {
  const writes = [];
  const job = { id: "job", shop: "shop.myshopify.com", kind: "product", status: "queued", attempts: 0, leaseToken: null, payload: "{}" };
  const db = { workJob: { findFirst: async () => job, updateMany: async (args) => { writes.push(args); return { count: 1 }; } }, session: { findFirst: async ({ where }) => { assert.equal(where.shop, job.shop); return { id: "session" }; } } };
  const result = await runOneJob({ db, getAdmin: async (shop) => { assert.equal(shop, job.shop); return {}; }, handlers: { product: async () => { throw new Error("AI unavailable"); } } });
  assert.equal(result, true); assert.equal(writes.at(-1).data.status, "queued"); assert.match(writes.at(-1).data.error, /AI unavailable/);
});
test("background image analysis saves a review without publishing when auto-approval is off", async () => {
  const saved = [];
  const db = { imageSettings: { findUnique: async () => ({ autoProcess: true, autoApprove: false, altTemplate: "[Product Title] [Color]" }) }, imageReview: {
    findUnique: async () => null, create: async ({ data }) => { saved.push(data); return { id: "review", ...data }; },
  } };
  const product = { id: "p", title: "Evening dress", productType: "Dress", options: [{ name: "Color", values: ["Black"] }], media: { nodes: [{ id: "m", alt: "", image: { url: "https://cdn.shopify.com/image.jpg" } }], pageInfo: { hasNextPage: false } } };
  const admin = { graphql: async (query) => { assert.equal(query.includes("mutation"), false); return Response.json({ data: { product } }); } };
  await processProduct({ job: { shop: "shop", productId: "p" }, payload: { source: "webhook" }, admin, db, assertActive: async () => {}, vision: async () => ({ color: "Black", confidence: 99 }) });
  assert.equal(saved[0].shop, "shop"); assert.equal(saved[0].generatedAlt, "Evening dress Black"); assert.equal(saved[0].status, "pending");
});
test("disabled webhook automation performs no API or AI requests", async () => {
  const db = { imageSettings: { findUnique: async () => ({ autoProcess: false }) } };
  await processProduct({ job: { shop: "shop" }, payload: { source: "webhook" }, admin: {}, db, assertActive: async () => {}, vision: async () => { throw new Error("Unexpected AI call"); } });
});
test("cancelling an image preparation releases its active record", async () => {
  let data;
  const tx = { workJob: { findFirst: async () => ({ id: "job", status: "queued", kind: "optimize", payload: '{"optimizationId":"image"}' }), updateMany: async () => ({ count: 1 }) }, imageOptimization: { updateMany: async (args) => { data = args.data; } } };
  const db = { $transaction: async (run) => run(tx) };
  const formData = new FormData(); formData.set("intent", "cancel"); formData.set("jobId", "job");
  const result = await handleAutomation({ shop: "shop", formData, db });
  assert.match(result.message, /cancelled/); assert.equal(data.activeMediaId, null); assert.equal(data.status, "failed");
});
