import { authenticate } from "../shopify.server";
import db from "../db.server";
import { attributionFromWebhook } from "../services/attribution.server";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic === "ORDERS_CREATE" || topic === "ORDERS_UPDATED" || topic === "ORDERS_PAID") {
    const order = payload;
    const attribution = attributionFromWebhook(order, shop);
    const where = { shop_orderId: { shop, orderId: String(order.id) } };
    const existing = await db.shopifyOrder.findUnique({ where, select: { attribution: true } });
    // A sync may already hold the full customer journey (first and last visit); keep that over the single webhook session.
    const keepJourney = existing?.attribution && JSON.parse(existing.attribution).first;

    await db.shopifyOrder.upsert({
      where,
      create: {
        shop,
        orderId: String(order.id),
        orderNumber: order.order_number ? String(order.order_number) : null,
        transactionId: order.checkout_id ? String(order.checkout_id) : null,
        totalPrice: parseFloat(order.total_price || 0),
        subtotalPrice: parseFloat(order.subtotal_price || 0),
        totalTax: parseFloat(order.total_tax || 0),
        totalShipping: parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0),
        currency: order.currency || "USD",
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        createdAt: new Date(order.created_at),
        raw: JSON.stringify(order),
        ...attribution,
      },
      update: {
        totalPrice: parseFloat(order.total_price || 0),
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        updatedAt: new Date(),
        ...(keepJourney ? {} : attribution),
      },
    });
  }

  return new Response();
};
