import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGa4Integration, listGa4Events } from "../services/ga4.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const integration = await getGa4Integration(session.shop);
  const events = await listGa4Events(session.shop);
  return { integration, events };
};

export default function Ga4Page() {
  const { integration, events } = useLoaderData();

  return (
    <s-page heading="GA4 Ecommerce Events">
      <s-section heading="Connection">
        <s-badge tone={integration?.status === "connected" ? "success" : "critical"}>
          {integration?.status || "disconnected"}
        </s-badge>
        {integration?.accountName && <s-paragraph>Property: {integration.accountName}</s-paragraph>}
      </s-section>

      <s-section heading={`Recent Events (${events.length})`}>
        {events.length === 0 ? (
          <s-paragraph>No GA4 events recorded yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="tight">
            {events.map((e) => (
              <div key={e.id}>
                <strong>{e.eventName}</strong> — {e.transactionId || "no tx"} — {e.currency} {e.value} — {e.status}
              </div>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Supported Events">
        <s-paragraph>
          view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart,
          begin_checkout, add_shipping_info, add_payment_info, purchase, refund
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);