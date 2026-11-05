import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getGtmIntegration, listGtmContainers } from "../services/gtm.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const integration = await getGtmIntegration(session.shop);
  const containers = await listGtmContainers();
  return { integration, containers };
};

export default function GtmPage() {
  const { integration, containers } = useLoaderData();

  return (
    <s-page heading="Google Tag Manager Inspector">
      <s-section heading="Connection">
        <s-badge tone={integration?.status === "connected" ? "success" : "critical"}>
          {integration?.status || "disconnected"}
        </s-badge>
      </s-section>
      <s-section heading="Containers">
        {containers.length === 0 && <s-paragraph>Container details are not available yet.</s-paragraph>}
        {containers.map((c) => (
          <div key={c.id}>
            <strong>{c.name}</strong> ({c.id}) — {c.status}
          </div>
        ))}
      </s-section>
      <s-section heading="What will be inspected">
        <s-paragraph>
          Tags, triggers, variables, version history, and Google tag configuration.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);