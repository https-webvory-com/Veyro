import test from "node:test";
import assert from "node:assert/strict";
import { auditProducts, clipText, suggestMetadata, validateMetadata } from "../app/services/seo.js";
import { handleSeoAction, loadSeoDashboard } from "../app/services/seo.server.js";

const productId = "gid://shopify/Product/1";
const shop = "test.myshopify.com";
const draft = { id: "draft-1", shop, productId, status: "pending", originalTitle: "Old title", originalDescription: "Old description", title: "New title", description: "New description" };
function form(intent, fields = {}) {
  const data = new FormData(); data.set("intent", intent); data.set("draftId", draft.id);
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
function database(row = draft) {
  const writes = [];
  return { writes, seoDraft: {
    findFirst: async ({ where }) => where.shop === shop ? row : null,
    updateMany: async (args) => { writes.push(args); return { count: 1 }; },
  } };
}
function current(seo = { title: draft.originalTitle, description: draft.originalDescription }) {
  return Response.json({ data: { product: { id: productId, seo } } });
}

test("audits use metadata fallbacks and detect duplicates only in selection", () => {
  const products = [1, 2].map((id) => ({ id, title: "Cotton shirt", description: "A cotton shirt with buttons.", seo: {}, imageCount: 1, missingAltCount: 0, mediaTruncated: false }));
  const result = auditProducts(products);
  assert.equal(result[0].audit.checks.find((check) => check.id === "title").passed, true);
  assert.equal(result[0].audit.checks.find((check) => check.id === "unique").passed, false);
  assert.equal(result[0].audit.passed, 5);
  assert.match(result[0].audit.checks[0].detail, /fallback/);
});
test("missing images cannot produce a passing ALT coverage check", () => {
  const [result] = auditProducts([{ id: 1, title: "Shirt", description: "", seo: {}, imageCount: 0, missingAltCount: 0 }]);
  assert.equal(result.audit.checks.find((check) => check.id === "alt").passed, false);
});
test("suggestions preserve existing metadata and never invent descriptions", () => {
  assert.deepEqual(suggestMetadata({ title: "Product", description: "", seo: {} }), { suggestedTitle: "Product", suggestedDescription: "" });
  assert.equal(suggestMetadata({ title: "Product", description: "Body", seo: { title: "Custom", description: "Specific" } }).suggestedDescription, "Specific");
  assert.ok(clipText("word ".repeat(50), 160).length <= 160);
  assert.equal(clipText("short title", 70), "short title");
});
test("metadata validation rejects blank and oversized values", () => {
  assert.throws(() => validateMetadata(form("save", { title: " ", description: "Fine" })));
  assert.throws(() => validateMetadata(form("save", { title: "x".repeat(71), description: "Fine" })));
  assert.throws(() => validateMetadata(form("save", { title: "Fine", description: "x".repeat(321) })));
});
test("another shop cannot publish a draft", async () => {
  const result = await handleSeoAction({ shop: "other.myshopify.com", db: database(), admin: {}, formData: form("save") });
  assert.match(result.error, /not found/);
});
test("stale SEO never sends a mutation", async () => {
  const db = database(); let calls = 0;
  const admin = { graphql: async () => { calls++; return current({ title: "Merchant edit", description: "Changed" }); } };
  const result = await handleSeoAction({ shop, db, admin, formData: form("save", { title: "New title", description: "New description" }) });
  assert.match(result.error, /changed in Shopify/); assert.equal(calls, 1);
  assert.equal(db.writes.at(-1).data.status, "pending");
});
test("confirmed metadata updates only write SEO and preserve audit history", async () => {
  const db = database();
  const admin = { graphql: async (query, { variables }) => {
    if (!query.includes("mutation")) return current();
    assert.deepEqual(variables.product, { id: productId, seo: { title: "New title", description: "New description" } });
    return Response.json({ data: { productUpdate: { product: { id: productId, seo: variables.product.seo }, userErrors: [] } } });
  } };
  const result = await handleSeoAction({ shop, db, admin, formData: form("save", { title: "New title", description: "New description" }) });
  assert.equal(result.success, true);
  assert.equal(db.writes.at(-1).data.status, "applied");
  assert.equal(db.writes.at(-1).data.activeProductId, null);
  assert.equal(db.writes.some((write) => "originalTitle" in write.data), false);
});
test("Shopify validation errors return the draft to review", async () => {
  const db = database();
  const admin = { graphql: async (query) => query.includes("mutation") ? Response.json({ data: { productUpdate: { product: null, userErrors: [{ message: "Permission denied" }] } } }) : current() };
  const result = await handleSeoAction({ shop, db, admin, formData: form("save", { title: "New title", description: "New description" }) });
  assert.match(result.error, /Permission denied/);
  assert.equal(db.writes.at(-1).data.status, "pending");
});
test("uncertain mutation outcome remains applying until reconciled", async () => {
  const db = database();
  const admin = { graphql: async (query) => { if (query.includes("mutation")) throw new Error("Network interruption"); return current(); } };
  const result = await handleSeoAction({ shop, db, admin, formData: form("save", { title: "New title", description: "New description" }) });
  assert.equal(result.success, false); assert.equal(db.writes.at(-1).data.status, "applying");
});
test("reconciliation confirms an interrupted update without another write", async () => {
  const db = database({ ...draft, status: "applying", updatedAt: new Date(Date.now() - 180000) });
  const admin = { graphql: async (query) => { assert.equal(query.includes("mutation"), false); return current({ title: "New title", description: "New description" }); } };
  const result = await handleSeoAction({ shop, db, admin, formData: form("reconcile") });
  assert.equal(result.success, true); assert.equal(db.writes.at(-1).data.status, "applied");
});
test("parallel save loses claim and does not call Shopify", async () => {
  const db = database(); db.seoDraft.updateMany = async () => ({ count: 0 });
  const result = await handleSeoAction({ shop, db, admin: {}, formData: form("save", { title: "New", description: "New description" }) });
  assert.match(result.error, /already being processed/);
});
test("bulk draft validation caps workload before calling Shopify", async () => {
  const formData = form("draft");
  for (let index = 1; index <= 21; index++) formData.append("productIds", `gid://shopify/Product/${index}`);
  const result = await handleSeoAction({ shop, db: {}, admin: {}, formData });
  assert.match(result.error, /between 1 and 20/);
});
test("bulk preparation saves original values, skips duplicates, and never publishes", async () => {
  const formData = form("draft"); formData.append("productIds", productId); formData.append("productIds", "gid://shopify/Product/2");
  const saved = [];
  const db = { seoDraft: { create: async ({ data }) => {
    if (data.productId.endsWith("/2")) { const error = new Error("Unique constraint"); error.code = "P2002"; throw error; }
    saved.push(data);
  } } };
  const admin = { graphql: async (query) => {
    assert.equal(query.includes("mutation"), false);
    return Response.json({ data: { nodes: [productId, "gid://shopify/Product/2"].map((id) => ({ id, title: "Cotton shirt", handle: "cotton-shirt", description: "Soft cotton shirt.", seo: { title: null, description: null }, media: { nodes: [], pageInfo: { hasNextPage: false } } })) } });
  } };
  const result = await handleSeoAction({ shop, db, admin, formData });
  assert.equal(result.success, true); assert.match(result.message, /1 SEO draft prepared/);
  assert.equal(saved[0].shop, shop); assert.equal(saved[0].originalTitle, "");
  assert.equal(saved[0].description, "Soft cotton shirt.");
});
test("active drafts are loaded before completed history to prevent starvation", async () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({ id: index, status: "pending" }));
  let reads = 0;
  const db = { seoDraft: { findMany: async ({ where, orderBy, take }) => {
    reads++; assert.deepEqual(where.status.in, ["pending", "applying"]); assert.equal(orderBy.createdAt, "asc"); assert.equal(take, 50); return rows;
  } } };
  const admin = { graphql: async () => Response.json({ data: { shop: { primaryDomain: { url: "https://test.example" } }, products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } }) };
  const result = await loadSeoDashboard({ shop, db, admin, request: new Request("https://app.example/app/seo") });
  assert.equal(reads, 1); assert.equal(result.drafts.length, 50);
});
test("pagination passes the opaque cursor without interpolating it", async () => {
  const db = { seoDraft: { findMany: async ({ where }) => { assert.equal(where.shop, shop); return []; } } };
  const admin = { graphql: async (query, { variables }) => {
    assert.equal(variables.after, "opaque-cursor"); assert.equal(query.includes("opaque-cursor"), false);
    return Response.json({ data: { shop: { primaryDomain: { url: "https://test.example" } }, products: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "next" } } } });
  } };
  const result = await loadSeoDashboard({ shop, db, admin, request: new Request("https://app.example/app/seo?after=opaque-cursor") });
  assert.equal(result.pageInfo.endCursor, "next");
});
