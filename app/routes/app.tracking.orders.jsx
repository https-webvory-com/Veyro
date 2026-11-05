import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listShopifyOrders } from "../services/tracking.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const orders = await listShopifyOrders(session.shop);
  return { orders };
};

export default function OrdersPage() {
  const { orders } = useLoaderData();

  return (
    <s-page heading="Shopify Orders">
      <s-section heading={`Stored Orders (${orders.length})`}>
        {orders.length === 0 ? (
          <s-paragraph>No orders yet. Place a test order or wait for webhooks.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {orders.map((order) => (
              <div key={order.id}>
                <strong>#{order.orderNumber || order.orderId}</strong> — {order.currency} {order.totalPrice} — {order.financialStatus}
              </div>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);