import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getAdsIntegration, listAdsEvents } from "../services/ads.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const integration = await getAdsIntegration(session.shop);
  const events = await listAdsEvents(session.shop);
  return { integration, events };
};

export default function AdsPage() {
  const { integration, events } = useLoaderData();

  return (
    <s-page heading="Google Ads Conversions">
      <s-section heading="Connection">
        <s-badge tone={integration?.status === "connected" ? "success" : "critical"}>
          {integration?.status || "disconnected"}
        </s-badge>
      </s-section>

      <s-section heading={`Recorded Conversions (${events.length})`}>
        {events.length === 0 ? (
          <s-paragraph>No Google Ads conversions recorded yet.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="tight">
            {events.map((e) => (
              <div key={e.id}>
                {e.transactionId || "no tx"} — {e.currency} {e.value} — {e.status}
              </div>
            ))}
          </s-stack>
        )}
      </s-section>

      <s-section heading="Notes">
        <s-paragraph>
          Primary vs secondary conversion actions, counting settings, and attribution models
          will be inspected once the Google Ads API is fully connected.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);