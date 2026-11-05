import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { GoogleConnections } from "../components/GoogleConnections";
import { GoogleCredentialsForm } from "../components/GoogleCredentialsForm";
import {
  disconnectGoogleIntegration,
  getGoogleAuthUrl,
  getGoogleCredentialStatus,
  getGoogleRedirectUri,
  getIntegrations,
  isGooglePlatform,
  removeGoogleCredentials,
  saveGoogleCredentials,
} from "../services/google-oauth.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [integrations, credentials] = await Promise.all([
    getIntegrations(session.shop),
    getGoogleCredentialStatus(session.shop),
  ]);
  const isConnected = (platform) =>
    integrations.some((i) => i.platform === platform && i.status === "connected");
  return {
    ...credentials,
    redirectUri: getGoogleRedirectUri(),
    connected: { ga4: isConnected("ga4"), ads: isConnected("google_ads"), gtm: isConnected("gtm") },
  };
};

export const action = async ({ request }) => {
  const { session, redirect } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-credentials") {
    return saveGoogleCredentials({
      shop: session.shop,
      clientId: formData.get("clientId"),
      clientSecret: formData.get("clientSecret"),
    });
  }
  if (intent === "remove-credentials") return removeGoogleCredentials(session.shop);

  const platform = formData.get("platform");
  if (!isGooglePlatform(platform)) return { error: "Unknown Google service." };

  if (intent === "disconnect") {
    await disconnectGoogleIntegration(session.shop, platform);
    return { ok: true };
  }

  const { configured, clientId } = await getGoogleCredentialStatus(session.shop);
  if (!configured) return { error: "Save your Google client ID and client secret first." };
  // Google's sign-in page refuses to load in a frame, so this must leave the Shopify admin iframe.
  return redirect(getGoogleAuthUrl(platform, session.shop, clientId), { target: "_top" });
};

const RESULT_BANNERS = {
  connected: { tone: "success", text: "Your Google account is connected." },
  denied: { tone: "warning", text: "Google access was not granted, so nothing was connected." },
  failed: { tone: "critical", text: "Google could not complete the connection. Check your client ID, client secret, and redirect URI, then try again." },
};

export default function IntegrationsPage() {
  const { connected, configured, clientId, redirectUri } = useLoaderData();
  const [searchParams] = useSearchParams();
  const result = RESULT_BANNERS[searchParams.get("google")];

  return (
    <s-page heading="Integrations">
      {result && <s-banner tone={result.tone}>{result.text}</s-banner>}
      <s-section heading="Google credentials">
        <GoogleCredentialsForm clientId={clientId} configured={configured} redirectUri={redirectUri} />
      </s-section>
      <s-section heading="Google accounts">
        <GoogleConnections connected={connected} configured={configured} />
      </s-section>
      <s-section slot="aside" heading="How connecting works">
        <s-paragraph>
          Save your credentials, then sign in with Google and approve access for each service. You can disconnect
          at any time, or remove Veyro from your Google Account permissions.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
