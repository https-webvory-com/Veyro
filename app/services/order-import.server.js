import prisma from "../db.server.js";
import { checkUserErrors, graphql } from "./shopify-api.server.js";
import { loadAttributionConfig, orderRecord, saveOrderRecord } from "./attribution.server.js";

// Imports every order through a Shopify bulk operation: Shopify prepares a JSONL file in the
// background, then Veyro reads it line by line. Progress is stored, so an interrupted import
// resumes from the last saved line instead of starting again.

const VISIT = "landingPage referrerUrl utmParameters { source medium campaign term content }";
export const BULK_ORDERS_QUERY = `{
  orders(sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id name createdAt sourceName
        displayFinancialStatus displayFulfillmentStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        currentSubtotalPriceSet { shopMoney { amount } }
        currentTotalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        customerJourneySummary { ready firstVisit { ${VISIT} } lastVisit { ${VISIT} } }
      }
    }
  }
}`;

const START_MUTATION = `#graphql
  mutation VeyroOrderImport($query: String!) {
    bulkOperationRunQuery(query: $query) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }`;

const STATUS_QUERY = `#graphql
  query VeyroOrderImportStatus($id: ID!) {
    node(id: $id) { ... on BulkOperation { id status errorCode objectCount url } }
  }`;

const SHOP_QUERY = `#graphql
  query VeyroShopDomain { shop { primaryDomain { host } } }`;

const ACTIVE = ["running", "processing"];
// A processing import whose progress hasn't moved for this long is assumed interrupted.
const STALE_MS = 2 * 60 * 1000;
const SAVE_EVERY = 100;

export async function getLatestImport(shop, db = prisma) {
  return db.orderImport.findFirst({ where: { shop }, orderBy: { startedAt: "desc" } });
}

export function publicImport(record) {
  if (!record) return null;
  return {
    status: record.status,
    objectCount: record.objectCount,
    processed: record.processed,
    error: record.error,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
  };
}

export async function startOrderImport({ admin, shop }, db = prisma) {
  const latest = await getLatestImport(shop, db);
  if (latest && ACTIVE.includes(latest.status)) return { message: "An import is already running." };

  const shopData = await graphql(admin, SHOP_QUERY);
  const data = await graphql(admin, START_MUTATION, { query: BULK_ORDERS_QUERY });
  try {
    checkUserErrors(data.bulkOperationRunQuery);
  } catch (error) {
    const busy = /already in progress|already running/i.test(error.message);
    return { error: busy ? "Shopify is already running an export for this store. Try again in a few minutes." : `Shopify couldn't start the import: ${error.message}` };
  }
  await db.orderImport.create({
    data: {
      shop,
      status: "running",
      bulkOperationId: data.bulkOperationRunQuery.bulkOperation.id,
      hosts: JSON.stringify([shop, shopData.shop?.primaryDomain?.host].filter(Boolean)),
    },
  });
  return { message: "Import started. Shopify is preparing your order history." };
}

// Moves an import forward: checks Shopify's export, and starts or resumes reading the file.
// Safe to call repeatedly; the page calls it every few seconds while an import is active.
export async function advanceOrderImport({ admin, shop }, db = prisma, { fetchImpl = fetch, now = Date.now(), background = true } = {}) {
  let record = await getLatestImport(shop, db);
  if (!record || !ACTIVE.includes(record.status)) return publicImport(record);

  if (record.status === "running") {
    const data = await graphql(admin, STATUS_QUERY, { id: record.bulkOperationId });
    const op = data.node;
    const objectCount = parseInt(op?.objectCount || "0", 10) || 0;
    if (!op || ["FAILED", "CANCELED", "CANCELING", "EXPIRED"].includes(op.status)) {
      const reason = op?.errorCode === "ACCESS_DENIED" ? "Shopify denied access to order data." : `Shopify stopped the export (${op?.errorCode || op?.status || "not found"}).`;
      record = await db.orderImport.update({ where: { id: record.id }, data: { status: "failed", error: reason, finishedAt: new Date(now) } });
      return publicImport(record);
    }
    if (op.status !== "COMPLETED") {
      record = await db.orderImport.update({ where: { id: record.id }, data: { objectCount } });
      return publicImport(record);
    }
    record = await db.orderImport.update({ where: { id: record.id }, data: { status: "processing", objectCount, url: op.url || null } });
  }

  const idle = now - new Date(record.updatedAt).getTime();
  const justStarted = record.processed === 0 && idle < 1000;
  if (record.status === "processing" && (justStarted || idle > STALE_MS)) {
    const run = processImportFile(record, db, { fetchImpl });
    if (background) run.catch(() => {});
    else await run;
    record = (await db.orderImport.findUnique({ where: { id: record.id } })) || record;
  }
  return publicImport(record);
}

// Reads the export file from the last saved line. Only one reader runs at a time: the claim
// succeeds only if nobody has touched the record since it was read.
export async function processImportFile(record, db = prisma, { fetchImpl = fetch } = {}) {
  const claimed = await db.orderImport.updateMany({
    where: { id: record.id, status: "processing", updatedAt: record.updatedAt },
    data: { error: null },
  });
  if (!claimed.count) return false;

  const fail = (message) => db.orderImport.update({ where: { id: record.id }, data: { status: "failed", error: message, finishedAt: new Date() } });
  try {
    if (!record.url) {
      await db.orderImport.update({ where: { id: record.id }, data: { status: "completed", finishedAt: new Date() } });
      return true;
    }
    const response = await fetchImpl(record.url);
    if (!response.ok) {
      await fail(`Couldn't download Shopify's export (HTTP ${response.status}). Start the import again.`);
      return false;
    }
    const lines = (await response.text()).split("\n").filter((line) => line.trim());
    const config = await loadAttributionConfig(record.shop, db);
    let hosts = [record.shop];
    try {
      hosts = JSON.parse(record.hosts || "[]");
    } catch {
      hosts = [record.shop];
    }

    let processed = record.processed;
    for (let i = record.processed; i < lines.length; i += 1) {
      const order = JSON.parse(lines[i]);
      // Top-level orders only; nested connection rows carry a __parentId.
      if (order.id?.includes("/Order/") && !order.__parentId) await saveOrderRecord(record.shop, orderRecord(order, hosts, config), db);
      processed = i + 1;
      if (processed % SAVE_EVERY === 0) await db.orderImport.update({ where: { id: record.id }, data: { processed } });
    }
    await db.orderImport.update({ where: { id: record.id }, data: { status: "completed", processed, objectCount: Math.max(record.objectCount, lines.length), finishedAt: new Date() } });
    return true;
  } catch (error) {
    await fail(`The import stopped: ${String(error.message).slice(0, 300)}. Start it again; orders already saved won't be duplicated.`);
    return false;
  }
}
