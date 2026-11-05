/* eslint-env node */
/* global globalThis */
import test from "node:test";
import assert from "node:assert/strict";
import { encryptKey, decryptKey, handleAiSettings, loadAiSettings, getAiCredentials } from "../app/services/ai-settings.server.js";
import { analyzeImage } from "../app/services/vision.server.js";

process.env.SHOPIFY_API_SECRET = "test-only-encryption-secret";
const key = "sk-test-merchant-private-key";
function database() {
  const records = new Map();
  const db = { aiConnection: {
    findUnique: async ({ where }) => records.get(where.shop) || null,
    upsert: async ({ where, create, update }) => records.set(where.shop, records.has(where.shop) ? { ...records.get(where.shop), ...update } : create),
    deleteMany: async ({ where }) => records.delete(where.shop),
  }, imageSettings: { updateMany: async (args) => { db.disabled = args; } }, $transaction: async (fn) => fn(db) };
  return db;
}
function form(intent = "save", apiKey = key, model = "vision-test-model") {
  const data = new FormData(); Object.entries({ intent, apiKey, model }).forEach(([name, value]) => data.set(name, value)); return data;
}
test("credentials use authenticated encryption bound to their shop", () => {
  const encoded = encryptKey(key, "a");
  assert.equal(encoded.includes(key), false);
  assert.notEqual(encoded, encryptKey(key, "a"));
  assert.equal(decryptKey(encoded, "a"), key);
  assert.throws(() => decryptKey(encoded, "b"), /cannot be read/);
});
test("settings responses never include credentials and stores remain isolated", async () => {
  const db = database();
  const result = await handleAiSettings({ shop: "a", formData: form(), db });
  assert.ok(result.message);
  assert.deepEqual(await loadAiSettings("a", db), { configured: true, hasKey: true, model: "vision-test-model" });
  assert.equal((await loadAiSettings("b", db)).configured, false);
  await assert.rejects(getAiCredentials("b", db), /AI settings/);
  await handleAiSettings({ shop: "a", formData: form("save", "", "replacement-model"), db });
  assert.deepEqual(await getAiCredentials("a", db), { apiKey: key, model: "replacement-model" });
  assert.equal(JSON.stringify(result).includes(key), false);
});
test("disconnect removes only this shop connection and disables its automation", async () => {
  const db = database();
  for (const shop of ["a", "b"]) await handleAiSettings({ shop, formData: form(), db });
  await handleAiSettings({ shop: "a", formData: form("disconnect"), db });
  assert.equal((await loadAiSettings("a", db)).configured, false);
  assert.equal((await loadAiSettings("b", db)).configured, true);
  assert.deepEqual(db.disabled, { where: { shop: "a" }, data: { autoProcess: false, autoApprove: false } });
});
test("missing keys and malformed models cannot enable AI", async () => {
  const db = database();
  assert.ok((await handleAiSettings({ shop: "a", formData: form("save", ""), db })).error);
  assert.ok((await handleAiSettings({ shop: "a", formData: form("save", key, "bad model"), db })).error);
});
test("vision requests use the current merchant key and model", async (t) => {
  const db = database(); await handleAiSettings({ shop: "a", formData: form(), db });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.equal(JSON.parse(options.body).model, "vision-test-model");
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: '{"color":"Black","confidence":99}' }] }] });
  });
  assert.equal((await analyzeImage("https://cdn.shopify.com/test.jpg", ["Black"], { shop: "a", db })).confidence, 99);
});
