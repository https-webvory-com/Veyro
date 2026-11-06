import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { listShopifyOrders } from "../services/tracking.server";
import { CHANNELS } from "../services/channels";
import { getCampaignBreakdown, getChannelBreakdown, syncOrderAttribution } from "../services/attribution.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [orders, channels, campaigns] = await Promise.all([
    listShopifyOrders(session.shop),
    getChannelBreakdown(session.shop),
    getCampaignBreakdown(session.shop),
  ]);
  return { orders, channels, campaigns };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  if (formData.get("intent") !== "sync") return { error: "Unknown action." };
  try {
    const { synced, pending } = await syncOrderAttribution({ admin, shop: session.shop });
    const note = pending.length ? ` Shopify is still processing the visit data for ${pending.length} recent order(s). Sync again in a few minutes.` : "";
    return { message: `Synced source data for ${synced} order(s).${note}` };
  } catch (error) {
    const denied = /access denied|protected customer data|not approved/i.test(error.message);
    return { error: denied ? "Shopify denied access to order data. Request protected customer data access for Veyro in the Partner Dashboard." : `Sync failed: ${error.message}` };
  }
};

const money = (value, currency) => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(value || 0);
  } catch {
    return `${currency || ""} ${Number(value || 0).toFixed(2)}`;
  }
};
const TONES = { google_ads: "info", google_organic: "success", paid_social: "info", microsoft_ads: "info", email: "success", direct: "neutral", unknown: "neutral" };

// eslint-disable-next-line react/prop-types
function ChannelBadge({ channel }) {
  const key = channel || "unknown";
  return <s-badge tone={TONES[key] || "neutral"}>{CHANNELS[key] || key}</s-badge>;
}

export default function OrdersPage() {
  const { orders, channels, campaigns } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const currency = orders[0]?.currency;

  return (
    <s-page heading="Order sources">
      <s-button slot="primary-action" variant="primary" loading={busy || undefined} onClick={() => fetcher.submit({ intent: "sync" }, { method: "post" })}>
        Sync orders
      </s-button>
      {fetcher.data?.message && <s-banner tone="success">{fetcher.data.message}</s-banner>}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}

      <s-section heading="Orders by source">
        {channels.length === 0 ? (
          <s-paragraph>No orders yet. Select Sync orders to import recent orders and see where they came from.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Source</s-table-header>
              <s-table-header format="numeric">Orders</s-table-header>
              <s-table-header format="numeric">Share</s-table-header>
              <s-table-header format="numeric">Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {channels.map((row) => (
                <s-table-row key={row.channel}>
                  <s-table-cell><ChannelBadge channel={row.channel} /></s-table-cell>
                  <s-table-cell>{row.orders}</s-table-cell>
                  <s-table-cell>{Math.round(row.share * 100)}%</s-table-cell>
                  <s-table-cell>{money(row.revenue, currency)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      {campaigns.length > 0 && (
        <s-section heading="Top campaigns">
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Campaign</s-table-header>
              <s-table-header>Source</s-table-header>
              <s-table-header format="numeric">Orders</s-table-header>
              <s-table-header format="numeric">Revenue</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {campaigns.map((row) => (
                <s-table-row key={`${row.channel}|${row.source}|${row.campaign}`}>
                  <s-table-cell>{row.campaign}</s-table-cell>
                  <s-table-cell>{row.source || row.label}</s-table-cell>
                  <s-table-cell>{row.orders}</s-table-cell>
                  <s-table-cell>{money(row.revenue, currency)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}

      <s-section heading={`Recent orders (${orders.length})`}>
        {orders.length === 0 ? (
          <s-paragraph>No orders stored yet.</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header listSlot="primary">Order</s-table-header>
              <s-table-header>Source</s-table-header>
              <s-table-header>Campaign</s-table-header>
              <s-table-header>Referrer</s-table-header>
              <s-table-header>Google click ID</s-table-header>
              <s-table-header format="numeric">Total</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {orders.map((order) => (
                <s-table-row key={order.id}>
                  <s-table-cell>#{order.orderNumber || order.orderId}</s-table-cell>
                  <s-table-cell><ChannelBadge channel={order.channel} /></s-table-cell>
                  <s-table-cell>{[order.utmSource, order.utmMedium, order.utmCampaign].filter(Boolean).join(" / ") || "—"}</s-table-cell>
                  <s-table-cell>{hostOf(order.referringSite) || "—"}</s-table-cell>
                  <s-table-cell>{order.gclid || order.gbraid || order.wbraid ? "Yes" : "—"}</s-table-cell>
                  <s-table-cell>{money(order.totalPrice, order.currency)}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="How sources are worked out">
        <s-paragraph>
          Veyro reads each order&apos;s customer journey from Shopify: the landing page, the referring site, and any
          UTM tags or ad click IDs (gclid, gbraid, wbraid, msclkid). The last visit that wasn&apos;t direct gets the
          credit. Orders with a Google click ID are counted as Google Ads.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
