import { useLoaderData, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getIntegrations, getGoogleAuthUrl } from "../services/google-oauth.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const integrations = await getIntegrations(session.shop);
  return { integrations, shop: session.shop };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const platform = formData.get("platform");

  if (!["ga4", "ads", "gtm"].includes(platform)) {
    return { error: "Invalid platform" };
  }

  const redirectUri = `${process.env.SHOPIFY_APP_URL}/app/tracking/google-callback`;
  const url = getGoogleAuthUrl(platform, session.shop, redirectUri);
  return { redirect: url };
};

export default function IntegrationsPage() {
  const { integrations } = useLoaderData();

  const status = (platform) =>
    integrations.find((i) => i.platform === platform)?.status || "disconnected";

  return (
    <s-page heading="Integrations">
      <s-section heading="Google Accounts">
        <s-stack direction="block" gap="base">
          <div>
            <strong>Google Analytics 4</strong> — {status("ga4")}
            <Form method="post">
              <input type="hidden" name="platform" value="ga4" />
              <button type="submit">Connect GA4</button>
            </Form>
          </div>
          <div>
            <strong>Google Ads</strong> — {status("google_ads")}
            <Form method="post">
              <input type="hidden" name="platform" value="ads" />
              <button type="submit">Connect Google Ads</button>
            </Form>
          </div>
          <div>
            <strong>Google Tag Manager</strong> — {status("gtm")}
            <Form method="post">
              <input type="hidden" name="platform" value="gtm" />
              <button type="submit">Connect GTM</button>
            </Form>
          </div>
        </s-stack>
      </s-section>
      <s-section slot="aside" heading="Setup">
        <s-paragraph>
          Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.
          Create credentials in Google Cloud Console with the required scopes.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);