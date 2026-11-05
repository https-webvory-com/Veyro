import db from "../db.server";

export async function reconcileRevenue(shop) {
  const orders = await db.shopifyOrder.findMany({ where: { shop } });
  const events = await db.trackingEvent.findMany({
    where: { shop, eventName: "purchase" },
  });

  const results = orders.map((order) => {
    const matching = events.filter(
      (e) => e.orderId === order.orderId || e.transactionId === order.transactionId
    );
    const ga4Value = matching
      .filter((e) => e.destination === "ga4")
      .reduce((sum, e) => sum + (e.value || 0), 0);
    const adsValue = matching
      .filter((e) => e.destination === "google_ads")
      .reduce((sum, e) => sum + (e.value || 0), 0);

    return {
      orderId: order.orderId,
      shopify: order.totalPrice,
      ga4: ga4Value,
      ads: adsValue,
      discrepancy: order.totalPrice - ga4Value,
    };
  });

  return results;
}