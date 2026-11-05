import db from "../db.server";

export async function detectDuplicatePurchases(shop) {
  const events = await db.trackingEvent.findMany({
    where: { shop, eventName: "purchase" },
  });

  const byOrder = {};
  for (const e of events) {
    const key = e.orderId || e.transactionId || "unknown";
    if (!byOrder[key]) byOrder[key] = [];
    byOrder[key].push(e);
  }

  const duplicates = Object.entries(byOrder)
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      count: list.length,
      destinations: [...new Set(list.map((e) => e.destination))],
      events: list,
    }));

  return duplicates;
}

export async function markDuplicates(shop) {
  const dups = await detectDuplicatePurchases(shop);
  for (const d of dups) {
    for (const e of d.events) {
      await db.trackingEvent.update({
        where: { id: e.id },
        data: { status: "duplicate" },
      });
    }
  }
  return dups.length;
}