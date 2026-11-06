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
    const note = pending.length ? ` Shopify is still processing visits for ${pending.length} recent order${pending.length === 1 ? "" : "s"}. Sync again in a few minutes.` : "";
    return { message: `Synced ${synced} order${synced === 1 ? "" : "s"} from Shopify.${note}` };
  } catch (error) {
    const denied = /access denied|protected customer data|not approved/i.test(error.message);
    return { error: denied ? "Shopify denied access to order data. Request protected customer data access for Veyro in the Partner Dashboard, then try again." : `Sync failed: ${error.message}` };
  }
};

export default function OrderSourcesPage() {
  const report = useLoaderData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();
  const busy = fetcher.state !== "idle";
  const syncing = busy && fetcher.formData?.get("intent") === "sync";
  const money = (value) => formatMoney(value, report.currency);
  const { totals } = report;

  const setParams = (changes) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { preventScrollReset: true });
  };
  const send = (intent) => fetcher.submit({ intent }, { method: "post" });

  return (
    <s-page heading="Order sources" inlineSize="large">
      <s-button slot="primary-action" variant="primary" loading={syncing || undefined} disabled={busy || undefined} onClick={() => send("sync")}>
        Sync orders
      </s-button>
      <s-button slot="secondary-actions" href="/app/tracking/attribution">
        Attribution settings
      </s-button>

      {fetcher.data?.message && <s-banner tone="success">{fetcher.data.message}</s-banner>}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
      {report.needsUpdate > 0 && !fetcher.data && (
        <s-banner tone="info" heading={`${report.needsUpdate} order${report.needsUpdate === 1 ? " needs" : "s need"} updated source details`}>
          These orders were stored before the full channel list was added. Updating takes a few seconds and doesn&apos;t
          contact Shopify.
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
              <s-paragraph>
                Veyro reads each order&apos;s visit history from Shopify and shows which ad, search engine, email, or
                website brought the customer.
              </s-paragraph>
              <s-button variant="primary" loading={syncing || undefined} onClick={() => send("sync")}>
                Sync orders
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      ) : (
        <>
          <s-section>
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text color="subdued">Give credit to:</s-text>
                {Object.entries(MODELS).map(([key, model]) => (
                  <s-button
                    key={key}
                    variant={key === report.model ? "primary" : "secondary"}
                    onClick={() => setParams({ model: key === report.defaultModel ? null : key })}
                  >
                    {model.short}
                  </s-button>
                ))}
              </s-stack>
              <s-text color="subdued">
                {MODELS[report.model].description}
                {report.model !== report.defaultModel && ` Your saved default is ${MODELS[report.defaultModel].label.toLowerCase()}.`}
              </s-text>

              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(180px, 1fr))" gap="base">
                <StatTile label="Orders tracked" value={totals.orders.toLocaleString()} detail={`${money(totals.revenue)} in sales`} />
                <StatTile
                  label="Source identified"
                  value={percent(totals.identifiedShare)}
                  detail="Orders with a known source"
                  tone={totals.identifiedShare >= 0.6 ? "success" : totals.identifiedShare >= 0.3 ? "caution" : "warning"}
                />
                <StatTile
                  label="Top source"
                  value={totals.topChannel ? totals.topChannel.label : "None yet"}
                  detail={totals.topChannel ? `${totals.topChannel.orders} order${totals.topChannel.orders === 1 ? "" : "s"}, ${money(totals.topChannel.revenue)}` : "No order has a known source yet"}
                />
                <StatTile label="Sales from paid ads" value={money(totals.paidRevenue)} detail={`${percent(totals.paidShare)} of all sales`} />
              </s-grid>
            </s-stack>
          </s-section>

          <s-section heading="Where orders come from">
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Source</s-table-header>
                <s-table-header format="numeric">Orders</s-table-header>
                <s-table-header>Share of orders</s-table-header>
                <s-table-header format="numeric">Sales</s-table-header>
                <s-table-header listSlot="inline">Details</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {report.groups.flatMap((group) => [
                  <s-table-row key={group.key}>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-500">
                        <s-text type="strong">{group.label}</s-text>
                        <s-text color="subdued">{group.description}</s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell><s-text type="strong">{group.orders}</s-text></s-table-cell>
                    <s-table-cell><ShareBar share={group.share} /></s-table-cell>
                    <s-table-cell><s-text type="strong">{money(group.revenue)}</s-text></s-table-cell>
                    <s-table-cell>
                      <s-button variant="tertiary" onClick={() => setParams({ group: group.key })} accessibilityLabel={`View ${group.label} orders`}>
                        View orders
                      </s-button>
                    </s-table-cell>
                  </s-table-row>,
                  ...group.channels.map((channel) => (
                    <s-table-row key={`${group.key}-${channel.key}`}>
                      <s-table-cell>
                        <div style={{ paddingInlineStart: "16px" }}>{channel.label}</div>
                      </s-table-cell>
                      <s-table-cell>{channel.orders}</s-table-cell>
                      <s-table-cell><ShareBar share={channel.share} subtle /></s-table-cell>
                      <s-table-cell>{money(channel.revenue)}</s-table-cell>
                      <s-table-cell />
                    </s-table-row>
                  )),
                ])}
              </s-table-body>
            </s-table>
          </s-section>

          <s-section heading="How sure are we?">
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Ad blockers, privacy settings, and some apps hide where a customer came from. Veyro shows how strong the
                evidence is for each order instead of guessing.
              </s-paragraph>
              <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
                {report.quality.map((q) => (
                  <s-box key={q.key} padding="base" borderWidth="base" borderColor="base" borderRadius="base">
                    <s-stack direction="block" gap="small-200">
                      <s-stack direction="inline" gap="small-200" alignItems="center" justifyContent="space-between">
                        <s-badge tone={q.tone}>{q.label}</s-badge>
                        <s-text type="strong">{q.orders}</s-text>
                      </s-stack>
                      <s-text color="subdued">{q.description}</s-text>
                      {q.orders > 0 && (
                        <s-button variant="tertiary" onClick={() => setParams({ status: q.key })} accessibilityLabel={`View orders: ${q.label}`}>
                          View orders
                        </s-button>
                      )}
                    </s-stack>
                  </s-box>
                ))}
              </s-grid>
            </s-stack>
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
                      <s-table-cell>{row.channel}{row.source ? ` · ${row.source}` : ""}</s-table-cell>
                      <s-table-cell>{row.orders}</s-table-cell>
                      <s-table-cell>{money(row.revenue)}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </s-section>
          )}

          <s-section heading="Orders">
            <s-stack direction="block" gap="base">
              {(report.filters.group || report.filters.status) && (
                <s-stack direction="inline" gap="small-200" alignItems="center">
                  <s-text color="subdued">Showing:</s-text>
                  {report.filters.group && <s-badge>{CHANNEL_GROUPS[report.filters.group].label}</s-badge>}
                  {report.filters.status && <s-badge>{STATUSES[report.filters.status].label}</s-badge>}
                  <s-button variant="tertiary" onClick={() => setParams({ group: null, status: null })}>
                    Show all orders
                  </s-button>
                </s-stack>
              )}
              {report.orders.length === 0 ? (
                <s-paragraph>No orders match this filter.</s-paragraph>
              ) : (
                <s-table>
                  <s-table-header-row>
                    <s-table-header listSlot="primary">Order</s-table-header>
                    <s-table-header listSlot="secondary">Credited to</s-table-header>
                    <s-table-header listSlot="inline">How sure</s-table-header>
                    <s-table-header>Why</s-table-header>
                    <s-table-header format="numeric">Total</s-table-header>
                  </s-table-header-row>
                  <s-table-body>
                    {report.orders.map((order) => {
                      const info = channelInfo(order.credited);
                      const status = STATUSES[order.attributionStatus];
                      return (
                        <s-table-row key={order.id}>
                          <s-table-cell>
                            <s-stack direction="block" gap="small-500">
                              <s-text type="strong">#{order.orderNumber || order.orderId}</s-text>
                              <s-text color="subdued">{formatDate(order.createdAt)}</s-text>
                            </s-stack>
                          </s-table-cell>
                          <s-table-cell>
                            <s-stack direction="block" gap="small-500">
                              <s-text type="strong">{info.label}</s-text>
                              <s-text color="subdued">{info.groupLabel}</s-text>
                            </s-stack>
                          </s-table-cell>
                          <s-table-cell>
                            {status ? <s-badge tone={status.tone}>{status.label}</s-badge> : <s-badge>Not checked</s-badge>}
                          </s-table-cell>
                          <s-table-cell>
                            <s-text color="subdued">{order.attributionEvidence || "Select Update orders above"}</s-text>
                          </s-table-cell>
                          <s-table-cell>{formatMoney(order.totalPrice, order.currency)}</s-table-cell>
                        </s-table-row>
                      );
                    })}
                  </s-table-body>
                </s-table>
              )}
              {report.orders.length === 50 && <s-text color="subdued">Showing the 50 most recent matching orders.</s-text>}
            </s-stack>
          </s-section>

          <s-section heading="How sources are worked out">
            <s-unordered-list>
              <s-list-item>Veyro reads each order&apos;s visits from Shopify: the landing page, the referring website, campaign (UTM) tags, and ad click IDs.</s-list-item>
              <s-list-item>Ad click IDs and campaign tags are the strongest evidence. A referring website alone tells us the source but not the campaign.</s-list-item>
              <s-list-item>Your own rules in Attribution settings are checked first, so you can label sources Veyro doesn&apos;t recognise.</s-list-item>
              <s-list-item>Ad platforms count conversions with their own time windows and rules, so their totals won&apos;t exactly match these.</s-list-item>
            </s-unordered-list>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
