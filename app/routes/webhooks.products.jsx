import { authenticate } from "../shopify.server.js";
import db from "../db.server.js";
import { enqueue } from "../services/queue.server.js";

export const action = async ({ request }) => {
  const { shop, payload, topic, session } = await authenticate.webhook(request);
  if (!session || !["PRODUCTS_CREATE", "PRODUCTS_UPDATE"].includes(topic)) return new Response();
  const settings = await db.imageSettings.findUnique({ where: { shop } });
  if (!settings?.autoProcess) return new Response();
  const productId = payload.admin_graphql_api_id || `gid://shopify/Product/${payload.id}`;
  if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) return new Response("Invalid product", { status: 400 });
  const event = request.headers.get("x-shopify-event-id") || request.headers.get("x-shopify-webhook-id");
  await enqueue({ shop, kind: "product", productId, payload: { source: "webhook" }, dedupeKey: event ? `${shop}:${event}` : null });
  return new Response();
};
