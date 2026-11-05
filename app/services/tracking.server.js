import db from "../db.server";
import { calculateHealthScore } from "./health.server";

export async function getTrackingDashboard(shop) {
  const [orders, integrations, health] = await Promise.all([
    db.shopifyOrder.count({ where: { shop } }),
    db.integration.findMany({ where: { shop } }),
    calculateHealthScore(shop),
  ]);

  const connected = Object.fromEntries(
    integrations.map((i) => [i.platform, i.status === "connected"])
  );

  return {
    shopifyOrders: orders,
    healthScore: health.score,
    healthReasons: health.reasons,
    connections: {
      shopify: true,
      ga4: !!connected.ga4,
      googleAds: !!connected.google_ads,
      gtm: !!connected.gtm,
    },
    ga4Purchases: 0,
    googleAdsConversions: 0,
    duplicates: 0,
    missing: 0,
  };
}

export async function recordTrackingEvent(data) {
  return db.trackingEvent.create({ data });
}

export async function listShopifyOrders(shop, take = 50) {
  return db.shopifyOrder.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take,
  });
}