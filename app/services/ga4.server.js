import db from "../db.server";

export async function getGa4Integration(shop) {
  return db.integration.findUnique({
    where: { shop_platform: { shop, platform: "ga4" } },
  });
}

export async function listGa4Events(shop, take = 100) {
  return db.trackingEvent.findMany({
    where: { shop, destination: "ga4" },
    orderBy: { timestamp: "desc" },
    take,
  });
}

export async function recordGa4Event({ shop, orderId, eventName, transactionId, value, currency, parameters }) {
  return db.trackingEvent.create({
    data: {
      shop,
      orderId,
      eventName,
      destination: "ga4",
      transactionId,
      value,
      currency,
      parameters: parameters ? JSON.stringify(parameters) : null,
      status: "received",
    },
  });
}

export function validatePurchaseParams(params) {
  const required = ["transaction_id", "value", "currency"];
  const missing = required.filter((k) => params[k] == null || params[k] === "");
  return {
    valid: missing.length === 0,
    missing,
  };
}