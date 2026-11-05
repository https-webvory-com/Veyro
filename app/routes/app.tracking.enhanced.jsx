import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkEnhancedConversions } from "../services/enhanced-conversions.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return checkEnhancedConversions({});
};

export default function EnhancedPage() {
  const data = useLoaderData();

  return (
    <s-page heading="Enhanced Conversions">
      <s-section heading="Status">
        <s-badge tone={data.enabled ? "success" : "critical"}>
          {data.enabled ? "Enabled" : "Not enabled"}
        </s-badge>
      </s-section>
      <s-section heading="Details">
        <s-paragraph>Method: {data.method}</s-paragraph>
        <s-paragraph>Hashing: {data.hashing ? "SHA-256" : "Unknown"}</s-paragraph>
        <s-paragraph>User data fields: {data.userDataFields.join(", ") || "None"}</s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);