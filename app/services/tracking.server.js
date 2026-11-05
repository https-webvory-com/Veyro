import db from "../db.server";

export async function getTrackingDashboard(shop) {
  const orders = await db.shopifyOrder.count({ where: { shop } });
  const health = await db.trackingHealth.findUnique({ where: { shop } });

  return {
    shopifyOrders: orders,
    healthScore: health?.score ?? 0,
    connections: {
      shopify: true,
      ga4: false,
      googleAds: false,
      gtm: false,
    },
  };
}

export async function recordTrackingEvent(data) {
  return db.trackingEvent.create({ data });
}