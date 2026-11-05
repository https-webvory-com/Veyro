import db from "../db.server";

export async function validateTransactionIds(shop) {
  const events = await db.trackingEvent.findMany({
    where: { shop, eventName: "purchase" },
  });

  return events.map((e) => {
    const issues = [];
    if (!e.transactionId) issues.push("Missing transaction_id");
    if (e.transactionId && e.transactionId.length < 3) issues.push("Transaction ID too short");
    return { id: e.id, transactionId: e.transactionId, issues };
  }).filter((r) => r.issues.length > 0);
}