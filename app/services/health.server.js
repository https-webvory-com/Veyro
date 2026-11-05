import db from "../db.server";

export async function calculateHealthScore(shop) {
  const [integrations, orders, events] = await Promise.all([
    db.integration.findMany({ where: { shop } }),
    db.shopifyOrder.count({ where: { shop } }),
    db.trackingEvent.count({ where: { shop, eventName: "purchase" } }),
  ]);

  let score = 0;
  const reasons = [];

  const connected = integrations.filter((i) => i.status === "connected");
  if (connected.some((i) => i.platform === "ga4")) {
    score += 25;
  } else {
    reasons.push("GA4 not connected");
  }
  if (connected.some((i) => i.platform === "google_ads")) {
    score += 25;
  } else {
    reasons.push("Google Ads not connected");
  }
  if (connected.some((i) => i.platform === "gtm")) {
    score += 15;
  } else {
    reasons.push("GTM not connected");
  }

  if (orders > 0) score += 15;
  else reasons.push("No Shopify orders stored");

  if (events > 0) score += 20;
  else reasons.push("No purchase events recorded");

  score = Math.min(100, score);

  await db.trackingHealth.upsert({
    where: { shop },
    create: { shop, score, categories: JSON.stringify(reasons) },
    update: { score, categories: JSON.stringify(reasons), lastChecked: new Date() },
  });

  return { score, reasons };
}