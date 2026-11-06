/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { advanceOrderImport, processImportFile, startOrderImport } from "../app/services/order-import.server.js";

const shop = "demo.myshopify.com";

function fakeDb() {
  let clock = 1_000_000;
  const tick = () => new Date((clock += 1000));
  const imports = [];
  const orders = new Map();
  const matches = (record, where) => Object.entries(where).every(([k, v]) => (v instanceof Date ? record[k]?.getTime() === v.getTime() : record[k] === v));
  return {
    imports,
    orders,
    attributionSettings: { findUnique: async () => null },
    channelRule: { findMany: async () => [] },
    shopifyOrder: {
      upsert: async ({ where, create, update }) => {
        const key = where.shop_orderId.orderId;
        orders.set(key, orders.has(key) ? { ...orders.get(key), ...update } : create);
      },
    },
    orderImport: {
      findFirst: async ({ where }) => imports.filter((r) => r.shop === where.shop).sort((a, b) => b.startedAt - a.startedAt)[0] || null,
      findUnique: async ({ where }) => imports.find((r) => r.id === where.id) || null,
      create: async ({ data }) => {
        const record = { id: `imp${imports.length + 1}`, status: "running", objectCount: 0, processed: 0, url: null, error: null, finishedAt: null, startedAt: tick(), updatedAt: tick(), ...data };
        imports.push(record);
        return record;
      },
      update: async ({ where, data }) => Object.assign(imports.find((r) => r.id === where.id), data, { updatedAt: tick() }),
      updateMany: async ({ where, data }) => {
        const hits = imports.filter((r) => matches(r, where));
        for (const r of hits) Object.assign(r, data, { updatedAt: tick() });
        return { count: hits.length };
      },
    },
    tick,
  };
}

const order = (id, extra = {}) => ({
  id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: "2026-10-01T00:00:00Z", sourceName: "web",
  currentTotalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
  customerJourneySummary: { ready: true, firstVisit: null, lastVisit: { landingPage: `https://shop.example/?utm_source=klaviyo&utm_medium=email&o=${id}`, referrerUrl: null } },
  ...extra,
});

function fakeAdmin(handler) {
  const calls = [];
  return {
    calls,
    graphql: async (query, { variables } = {}) => {
      calls.push({ query, variables });
      return Response.json({ data: handler(query, variables) });
    },
  };
}

const okFile = (lines) => async () => new Response(lines.map((l) => JSON.stringify(l)).join("\n"), { status: 200 });

test("starting an import records the bulk operation and refuses a second one", async () => {
  const db = fakeDb();
  const admin = fakeAdmin((q) => (q.includes("VeyroShopDomain")
    ? { shop: { primaryDomain: { host: "shop.example" } } }
    : { bulkOperationRunQuery: { bulkOperation: { id: "gid://shopify/BulkOperation/1", status: "CREATED" }, userErrors: [] } }));
  assert.match((await startOrderImport({ admin, shop }, db)).message, /started/);
  assert.equal(db.imports[0].bulkOperationId, "gid://shopify/BulkOperation/1");
  assert.deepEqual(JSON.parse(db.imports[0].hosts), [shop, "shop.example"]);
  assert.match(admin.calls[1].variables.query, /customerJourneySummary/);
  assert.match((await startOrderImport({ admin, shop }, db)).message, /already running/);
  assert.equal(db.imports.length, 1);
});

test("Shopify refusing to start is reported plainly", async () => {
  const db = fakeDb();
  const admin = fakeAdmin((q) => (q.includes("VeyroShopDomain") ? { shop: {} } : { bulkOperationRunQuery: { bulkOperation: null, userErrors: [{ field: null, message: "A bulk query operation for this app and shop is already in progress" }] } }));
  assert.match((await startOrderImport({ admin, shop }, db)).error, /already running an export/);
  assert.equal(db.imports.length, 0);
});

test("an import waits while Shopify prepares, then saves every order", async () => {
  const db = fakeDb();
  await db.orderImport.create({ data: { shop, bulkOperationId: "op1", hosts: JSON.stringify([shop, "shop.example"]) } });
  let status = "RUNNING";
  const admin = fakeAdmin(() => ({ node: { id: "op1", status, errorCode: null, objectCount: "3", url: status === "COMPLETED" ? "https://files.example/orders.jsonl" : null } }));

  let state = await advanceOrderImport({ admin, shop }, db, { background: false });
  assert.deepEqual([state.status, state.objectCount], ["running", 3]);

  status = "COMPLETED";
  const lines = [order(1), { id: "gid://shopify/LineItem/9", __parentId: "gid://shopify/Order/1" }, order(2)];
  state = await advanceOrderImport({ admin, shop }, db, { background: false, fetchImpl: okFile(lines), now: Date.now() });
  assert.equal(state.status, "completed");
  assert.equal(state.processed, 3);
  assert.equal(db.orders.size, 2, "nested rows are skipped");
  assert.equal(db.orders.get("1").channel, "klaviyo_email");
});

test("a failed export or download is recorded with a reason", async () => {
  const db = fakeDb();
  await db.orderImport.create({ data: { shop, bulkOperationId: "op1" } });
  const admin = fakeAdmin(() => ({ node: { id: "op1", status: "FAILED", errorCode: "ACCESS_DENIED", objectCount: "0" } }));
  const state = await advanceOrderImport({ admin, shop }, db, { background: false });
  assert.equal(state.status, "failed");
  assert.match(state.error, /denied/);

  const db2 = fakeDb();
  const record = await db2.orderImport.create({ data: { shop, status: "processing", url: "https://files.example/x" } });
  await processImportFile(record, db2, { fetchImpl: async () => new Response("", { status: 403 }) });
  assert.match(db2.imports[0].error, /HTTP 403/);
});

test("an interrupted import resumes from the last saved line, and only one reader runs", async () => {
  const db = fakeDb();
  const record = await db.orderImport.create({ data: { shop, status: "processing", url: "https://files.example/x", processed: 1, objectCount: 3, hosts: JSON.stringify([shop]) } });
  const stale = { ...record };
  // Another reader claimed it first.
  await db.orderImport.updateMany({ where: { id: record.id }, data: {} });
  assert.equal(await processImportFile(stale, db, { fetchImpl: okFile([order(1), order(2), order(3)]) }), false);

  const fresh = await db.orderImport.findUnique({ where: { id: record.id } });
  assert.equal(await processImportFile(fresh, db, { fetchImpl: okFile([order(1), order(2), order(3)]) }), true);
  assert.deepEqual([...db.orders.keys()].sort(), ["2", "3"], "line 1 was saved before the interruption");
  assert.equal(db.imports[0].status, "completed");
});

test("a stalled import is picked up again by the next status check", async () => {
  const db = fakeDb();
  await db.orderImport.create({ data: { shop, status: "processing", url: "https://files.example/x", processed: 0, objectCount: 1, hosts: JSON.stringify([shop]) } });
  const admin = fakeAdmin(() => ({}));
  const later = Date.now() + 10 * 60 * 1000;
  const state = await advanceOrderImport({ admin, shop }, db, { background: false, now: later, fetchImpl: okFile([order(7)]) });
  assert.equal(state.status, "completed");
  assert.ok(db.orders.has("7"));
  assert.equal(admin.calls.length, 0, "no Shopify call needed once the file is ready");
});
