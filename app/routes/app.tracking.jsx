import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getTrackingDashboard } from "../services/tracking.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const data = await getTrackingDashboard(session.shop);
  return data;
};

export default function TrackingDashboard() {
  const data = useLoaderData();

  return (
    <s-page heading="Tracking Intelligence">
      <s-section heading="Connection Status">
        <s-stack direction="inline" gap="base">
          <s-badge tone="success">Shopify</s-badge>
          <s-badge tone={data.connections.ga4 ? "success" : "critical"}>GA4</s-badge>
          <s-badge tone={data.connections.googleAds ? "success" : "critical"}>Google Ads</s-badge>
          <s-badge tone={data.connections.gtm ? "success" : "critical"}>GTM</s-badge>
        </s-stack>
      </s-section>

      <s-section heading={`Tracking Health Score: ${data.healthScore}/100`}>
        <s-paragraph>
          {data.healthScore === 0
            ? "No health data yet. Connect Google accounts and sync orders."
            : "Score based on current integration status and order coverage."}
        </s-paragraph>
      </s-section>

      <s-section heading="Key Metrics">
        <s-stack direction="block" gap="base">
          <s-paragraph>Shopify Orders stored: {data.shopifyOrders}</s-paragraph>
          <s-paragraph>GA4 Purchase Events: {data.ga4Purchases ?? 0}</s-paragraph>
          <s-paragraph>Google Ads Conversions: {data.googleAdsConversions ?? 0}</s-paragraph>
          <s-paragraph>Duplicate Purchases: {data.duplicates ?? 0}</s-paragraph>
          <s-paragraph>Missing Purchase Events: {data.missing ?? 0}</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Actions">
        <s-stack direction="inline" gap="base">
          <s-link href="/app/tracking/integrations">Manage Integrations</s-link>
          <s-link href="/app/tracking/orders">View Shopify Orders</s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);