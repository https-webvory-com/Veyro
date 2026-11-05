import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { checkConversionLinker } from "../services/conversion-linker.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  // Placeholder tags — replace with real GTM tags later
  const result = checkConversionLinker([]);
  return result;
};

export default function LinkerPage() {
  const result = useLoaderData();

  return (
    <s-page heading="Conversion Linker Monitor">
      <s-section heading="Status">
        <s-badge tone={result.present && result.enabled ? "success" : "critical"}>
          {result.present ? (result.enabled ? "Enabled" : "Disabled") : "Missing"}
        </s-badge>
      </s-section>
      <s-section heading="Why it matters">
        <s-paragraph>
          Conversion Linker helps Google Ads attribute conversions across domains and devices.
          It should be present and enabled on all pages.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);