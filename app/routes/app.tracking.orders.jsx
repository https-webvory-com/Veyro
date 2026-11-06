import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAttributionReport, reapplyAttribution, syncOrderAttribution } from "../services/attribution.server";
import { CHANNEL_GROUPS, MODELS, STATUSES, channelInfo } from "../services/channels";
import { formatDate, formatMoney, percent, ShareBar, StatTile } from "../components/AttributionUi";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  return getAttributionReport(session.shop, {
    model: url.searchParams.get("model"),
    group: url.searchParams.get("group"),
    channel: url.searchParams.get("channel"),
    status: url.searchParams.get("status"),
  });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "reapply") {
    const count = await reapplyAttribution(session.shop);
    return { message: `Updated the sources of ${count} order${count === 1 ? "" : "s"}.` };
  }
  if (intent !== "sync") return { error: "Unknown action." };
  try {
    const { synced, pending } = await syncOrderAttribution({ admin, shop: session.shop });
    const note = pending.length ? ` Shopify is still processing ${pending.length} recent order${pending.length === 1 ? "" : "s"}; sync again in a few minutes.` : "";
    return { message: `Synced ${synced} order${synced === 1 ? "" : "s"} from Shopify.${note}` };
  } catch (error) {
    const denied = /access denied|protected customer data|not approved/i.test(error.message);
    return { error: denied ? "Shopify denied access to order data. Request protected customer data access for Veyro in the Partner Dashboard, then try again." : `Sync failed: ${error.message}` };
  }
};

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

export default function OrderSourcesPage() {
  const report = useLoaderData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const busy = fetcher.state !== "idle";
  const syncing = busy && fetcher.formData?.get("intent") === "sync";
  const money = (value) => formatMoney(value, report.currency);
  const { totals, filters } = report;
  const qualityRows = report.quality.filter((q) => q.orders > 0);

  const setParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { preventScrollReset: true });
  };
  const send = (intent) => fetcher.submit({ intent }, { method: "post" });
  const filterLabel = filters.channel ? channelInfo(filters.channel).label
    : filters.group ? CHANNEL_GROUPS[filters.group].label
    : filters.status ? STATUSES[filters.status].label
    : null;

  return (
    <s-page heading="Order sources" inlineSize="large">
      <s-button slot="primary-action" variant="primary" loading={syncing || undefined} disabled={busy || undefined} onClick={() => send("sync")}>
        Sync orders
      </s-button>
      <s-button slot="secondary-actions" href="/app/tracking/attribution">
        Settings
      </s-button>

      {fetcher.data?.message && <s-banner tone="success">{fetcher.data.message}</s-banner>}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
      {report.needsUpdate > 0 && !fetcher.data && (
        <s-banner tone="info" heading={`${plural(report.needsUpdate, "order")} can show more detail`}>
          <s-button slot="secondary-actions" onClick={() => send("reapply")} disabled={busy || undefined}>
            Update orders
          </s-button>
        </s-banner>
      )}

      {totals.orders === 0 ? (
        <s-section>
          <s-box padding="large">
            <s-stack direction="block" gap="base" alignItems="center">
              <s-heading>See where your orders come from</s-heading>
              <s-text color="subdued">Sync your orders to see which ads, searches, emails, and websites bring in sales.</s-text>
              <s-button variant="primary" loading={syncing || undefined} onClick={() => send("sync")}>
                Sync orders
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      ) : (
        <>
          <s-grid gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap="base">
            <StatTile label="Orders" value={totals.orders.toLocaleString()} detail={`${money(totals.revenue)} in sales`} />
            <StatTile label="Source known" value={percent(totals.identifiedShare)} detail="of orders" />
            <StatTile
              label="Top source"
              value={totals.topChannel ? totals.topChannel.label : "—"}
              detail={totals.topChannel ? plural(totals.topChannel.orders, "order") : "No known sources yet"}
            />
            <StatTile label="Paid ads" value={money(totals.paidRevenue)} detail={`${percent(totals.paidShare)} of sales`} />
          </s-grid>

          <s-section heading="Sales by source">
            <s-button slot="secondary-actions" commandFor="model-menu" variant="tertiary" icon="caret-down">
              Credit: {MODELS[report.model].label}
            </s-button>
            <s-menu id="model-menu" accessibilityLabel="Choose which visit gets credit">
              {Object.entries(MODELS).map(([key, model]) => (
                <s-button key={key} onClick={() => setParams({ model: key === report.defaultModel ? null : key })}>
                  {model.label}{key === report.defaultModel ? " (default)" : ""}
                </s-button>
              ))}
            </s-menu>
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Source</s-table-header>
                <s-table-header listSlot="secondary">Type</s-table-header>
                <s-table-header format="numeric">Orders</s-table-header>
                <s-table-header>Share</s-table-header>
                <s-table-header format="numeric">Sales</s-table-header>
                <s-table-header format="numeric">Avg. order</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {report.rows.map((row) => (
                  <s-table-row key={row.key} clickDelegate={`source-${row.key}`}>
                    <s-table-cell>
                      <s-link id={`source-${row.key}`} onClick={() => setParams({ channel: row.key, group: null, status: null })}>
                        {row.label}
                      </s-link>
                    </s-table-cell>
                    <s-table-cell><s-badge tone={row.tone}>{row.groupLabel}</s-badge></s-table-cell>
                    <s-table-cell>{row.orders.toLocaleString()}</s-table-cell>
                    <s-table-cell><ShareBar share={row.share} /></s-table-cell>
                    <s-table-cell>{money(row.revenue)}</s-table-cell>
                    <s-table-cell>{money(row.average)}</s-table-cell>
                  </s-table-row>
                ))}
                <s-table-row>
                  <s-table-cell><s-text type="strong">Total</s-text></s-table-cell>
                  <s-table-cell />
                  <s-table-cell><s-text type="strong">{totals.orders.toLocaleString()}</s-text></s-table-cell>
                  <s-table-cell />
                  <s-table-cell><s-text type="strong">{money(totals.revenue)}</s-text></s-table-cell>
                  <s-table-cell><s-text type="strong">{money(totals.orders ? totals.revenue / totals.orders : 0)}</s-text></s-table-cell>
                </s-table-row>
              </s-table-body>
            </s-table>
          </s-section>

          <s-section heading="Tracking quality">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Status</s-table-header>
                <s-table-header listSlot="secondary">Meaning</s-table-header>
                <s-table-header format="numeric">Orders</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {qualityRows.map((q) => (
                  <s-table-row key={q.key} clickDelegate={`status-${q.key}`}>
                    <s-table-cell>
                      <s-link id={`status-${q.key}`} onClick={() => setParams({ status: q.key, group: null, channel: null })}>
                        <s-badge tone={q.tone}>{q.label}</s-badge>
                      </s-link>
                    </s-table-cell>
                    <s-table-cell><s-text color="subdued">{q.description}</s-text></s-table-cell>
                    <s-table-cell>{q.orders.toLocaleString()}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          </s-section>

          {report.campaigns.length > 0 && (
            <s-section heading="Top campaigns">
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Campaign</s-table-header>
                  <s-table-header listSlot="secondary">Source</s-table-header>
                  <s-table-header format="numeric">Orders</s-table-header>
                  <s-table-header format="numeric">Sales</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {report.campaigns.map((row) => (
                    <s-table-row key={`${row.channel}|${row.source}|${row.campaign}`}>
                      <s-table-cell>{row.campaign}</s-table-cell>
                      <s-table-cell>{row.channel}</s-table-cell>
                      <s-table-cell>{row.orders.toLocaleString()}</s-table-cell>
                      <s-table-cell>{money(row.revenue)}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}

          <s-section heading={filterLabel ? `Orders: ${filterLabel}` : "Recent orders"}>
            {filterLabel && (
              <s-button slot="secondary-actions" variant="tertiary" onClick={() => setParams({ group: null, channel: null, status: null })}>
                Show all
              </s-button>
            )}
            {report.orders.length === 0 ? (
              <s-text color="subdued">No orders match this filter.</s-text>
            ) : (
              <s-table>
                <s-table-header-row>
                  <s-table-header listSlot="primary">Order</s-table-header>
                  <s-table-header listSlot="secondary">Source</s-table-header>
                  <s-table-header listSlot="inline">Status</s-table-header>
                  <s-table-header>Date</s-table-header>
                  <s-table-header format="numeric">Total</s-table-header>
                </s-table-header-row>
                <s-table-body>
                  {report.orders.map((order) => {
                    const info = channelInfo(order.credited);
                    const status = STATUSES[order.attributionStatus];
                    return (
                      <s-table-row key={order.id}>
                        <s-table-cell><s-text type="strong">#{order.orderNumber || order.orderId}</s-text></s-table-cell>
                        <s-table-cell>
                          <s-stack direction="block" gap="small-500">
                            <s-text>{info.label}</s-text>
                            {order.attributionEvidence && <s-text color="subdued">{order.attributionEvidence}</s-text>}
                          </s-stack>
                        </s-table-cell>
                        <s-table-cell>
                          {status ? <s-badge tone={status.tone}>{status.label}</s-badge> : <s-badge>Not checked</s-badge>}
                        </s-table-cell>
                        <s-table-cell>{formatDate(order.createdAt)}</s-table-cell>
                        <s-table-cell>{formatMoney(order.totalPrice, order.currency)}</s-table-cell>
                      </s-table-row>
                    );
                  })}
                </s-table-body>
              </s-table>
            )}
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
