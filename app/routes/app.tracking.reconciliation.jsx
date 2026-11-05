import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { reconcileRevenue } from "../services/reconciliation.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const results = await reconcileRevenue(session.shop);
  return { results };
};

export default function ReconciliationPage() {
  const { results } = useLoaderData();

  return (
    <s-page heading="Revenue Reconciliation">
      <s-section heading="Shopify vs GA4 / Ads">
        {results.length === 0 ? (
          <s-paragraph>No orders to reconcile.</s-paragraph>
        ) : (
          results.map((r) => (
            <div key={r.orderId}>
              Order {r.orderId}: Shopify {r.shopify} | GA4 {r.ga4} | Ads {r.ads} | Diff {r.discrepancy}
            </div>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);