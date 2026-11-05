import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  return {
    shop,
    connections: {
      shopify: true,
      ga4: false,
      googleAds: false,
      gtm: false,
    },
    healthScore: 42,
    metrics: {
      shopifyOrders: 0,
      ga4Purchases: 0,
      googleAdsConversions: 0,
      duplicates: 0,
      missing: 0,
    },
    lastUpdated: new Date().toISOString(),
  };
};

export default function TrackingDashboard() {
  const data = useLoaderData();

  return (
    <s-page heading="Tracking Intelligence">
      <s-section heading="Connection Status">
        <s-stack direction="inline" gap="base">
          <s-badge tone={data.connections.shopify ? "success" : "critical"}>Shopify</s-badge>
          <s-badge tone={data.connections.ga4 ? "success" : "critical"}>GA4</s-badge>
          <s-badge tone={data.connections.googleAds ? "success" : "critical"}>Google Ads</s-badge>
          <s-badge tone={data.connections.gtm ? "success" : "critical"}>GTM</s-badge>
        </s-stack>
      </s-section>

      <s-section heading={`Tracking Health Score: ${data.healthScore}/100`}>
        <s-paragraph>Score is provisional. Connect Google accounts and sync orders for accurate scoring.</s-paragraph>
      </s-section>

      <s-section heading="Key Metrics (Last 30 days)">
        <s-stack direction="block" gap="base">
          <s-paragraph>Shopify Orders: {data.metrics.shopifyOrders}</s-paragraph>
          <s-paragraph>GA4 Purchase Events: {data.metrics.ga4Purchases}</s-paragraph>
          <s-paragraph>Google Ads Conversions: {data.metrics.googleAdsConversions}</s-paragraph>
          <s-paragraph>Duplicate Purchases: {data.metrics.duplicates}</s-paragraph>
          <s-paragraph>Missing Purchase Events: {data.metrics.missing}</s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Next Steps">
        <s-unordered-list>
          <s-list-item>Connect Google Analytics 4</s-list-item>
          <s-list-item>Connect Google Ads</s-list-item>
          <s-list-item>Connect Google Tag Manager</s-list-item>
          <s-list-item>Enable order webhooks (already configured in shopify.app.toml)</s-list-item>
        </s-unordered-list>
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Central dashboard for Shopify + GA4 + Google Ads + GTM tracking health, reconciliation, and diagnostics.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);