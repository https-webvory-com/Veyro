import db from "../db.server";
import { INTEGRATION_PUBLIC_FIELDS } from "./google-oauth.server";

export async function getAdsIntegration(shop) {
  return db.integration.findUnique({
    where: { shop_platform: { shop, platform: "google_ads" } },
    select: INTEGRATION_PUBLIC_FIELDS,
  });
}

export async function listAdsEvents(shop, take = 100) {
  return db.trackingEvent.findMany({
    where: { shop, destination: "google_ads" },
    orderBy: { timestamp: "desc" },
    take,
  });
}

export async function recordAdsConversion({ shop, orderId, transactionId, value, currency, conversionAction }) {
  return db.trackingEvent.create({
    data: {
      shop,
      orderId,
      eventName: "purchase",
      destination: "google_ads",
      transactionId,
      value,
      currency,
      parameters: JSON.stringify({ conversionAction }),
      status: "received",
    },
  });
}