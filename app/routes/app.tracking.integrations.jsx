import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GoogleConnections } from "../components/GoogleConnections";
import {
  disconnectGoogleIntegration,
  getGoogleAuthUrl,
  getIntegrations,
  isGoogleConfigured,
  isGooglePlatform,
} from "../services/google-oauth.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const integrations = await getIntegrations(session.shop);
  const isConnected = (platform) =>
    integrations.some((i) => i.platform === platform && i.status === "connected");
  return {
    configured: isGoogleConfigured(),
    connected: { ga4: isConnected("ga4"), ads: isConnected("google_ads"), gtm: isConnected("gtm") },
  };
};

export const action = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const platform = formData.get("platform");
  if (!isGooglePlatform(platform)) return { error: "Unknown Google service." };

  if (formData.get("intent") === "disconnect") {
    await disconnectGoogleIntegration(session.shop, platform);
    return { ok: true };
  }

  if (!isGoogleConfigured()) return { error: "Google connections are not available yet." };
  // Google's sign-in page refuses to load in a frame, so this must leave the Shopify admin iframe.
  return redirect(getGoogleAuthUrl(platform, session.shop), { target: "_top" });
};

const RESULT_BANNERS = {
  connected: { tone: "success", text: "Your Google account is connected." },
  denied: { tone: "warning", text: "Google access was not granted, so nothing was connected." },
  failed: { tone: "critical", text: "Google could not complete the connection. Please try again." },
};

export default function IntegrationsPage() {
  const { connected, configured } = useLoaderData();
  const [searchParams] = useSearchParams();
  const result = RESULT_BANNERS[searchParams.get("google")];

  return (
    <s-page heading="Integrations">
      {result && <s-banner tone={result.tone}>{result.text}</s-banner>}
      <s-section heading="Google accounts">
        <GoogleConnections connected={connected} configured={configured} />
      </s-section>
      <s-section slot="aside" heading="How connecting works">
        <s-paragraph>
          You will sign in with Google and approve access for each service. You can disconnect here at any
          time, or remove Veyro from your Google Account permissions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
