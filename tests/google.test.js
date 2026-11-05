/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { searchConsoleToken, performanceSummary, processGoogle } from "../app/services/google.server.js";

test("performance results use measured values and preserve unavailable metrics", () => {
  const result = performanceSummary({ lighthouseResult: { categories: { performance: { score: 0.82 } }, audits: { "largest-contentful-paint": { numericValue: 2300 } } } });
  assert.equal(result.score, 82); assert.equal(result.lcpMs, 2300); assert.equal(result.cls, null);
  assert.throws(() => performanceSummary({ lighthouseResult: { runtimeError: { code: "FAILED" } } }));
});
test("service-account token uses signed short-lived JWT with least read scope", async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const old = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "test@example.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  t.after(() => { if (old === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = old; });
  const token = await searchConsoleToken(false, async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/token");
    const assertion = options.body.get("assertion"); const [header, payload, signature] = assertion.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    assert.equal(claims.scope, "https://www.googleapis.com/auth/webmasters.readonly");
    assert.equal(claims.exp - claims.iat, 3600);
    assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")), true);
    return Response.json({ access_token: "test-token" });
  });
  assert.equal(token, "test-token");
});
test("Search Console sync is bound to the authenticated store property", async () => {
  let saved;
  const db = { integrationReport: { upsert: async (args) => { saved = args; } } };
  const admin = { graphql: async () => Response.json({ data: { shop: { primaryDomain: { url: "https://store.example" } } } }) };
  await processGoogle({ job: { kind: "searchConsole", shop: "store.myshopify.com" }, admin, db, assertActive: async () => {}, token: async (write) => { assert.equal(write, false); return "token"; }, request: async (url, options) => {
    assert.equal(url, "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fstore.example%2F/searchAnalytics/query");
    assert.equal(JSON.parse(options.body).rowLimit, 28);
    return Response.json({ rows: [{ keys: ["2026-01-01"], clicks: 2, impressions: 10, ctr: 0.2, position: 3 }] });
  } });
  assert.equal(saved.where.shop_kind.shop, "store.myshopify.com");
  assert.equal(JSON.parse(saved.create.report).ctr, 0.2);
});
test("sitemap submission uses only the store's sitemap and requires write scope", async () => {
  const db = { integrationReport: { upsert: async () => {} } };
  const admin = { graphql: async () => Response.json({ data: { shop: { primaryDomain: { url: "https://store.example" } } } }) };
  await processGoogle({ job: { kind: "sitemapSubmit", shop: "store.myshopify.com" }, admin, db, assertActive: async () => {}, token: async (write) => { assert.equal(write, true); return "token"; }, request: async (url, options) => {
    assert.ok(url.endsWith("/sitemaps/https%3A%2F%2Fstore.example%2Fsitemap.xml")); assert.equal(options.method, "PUT"); return new Response(null, { status: 204 });
  } });
});
