import { redirect } from "react-router";
import {
  GOOGLE_PLATFORMS,
  exchangeGoogleCode,
  getGoogleCredentials,
  getIntegrationsAdminUrl,
  saveGoogleIntegration,
  verifyGoogleState,
} from "../services/google-oauth.server";

// Google redirects the top-level browser here, outside the Shopify admin iframe, so there is no
// Shopify session to check. The signed state is what ties this request to the shop that started it.
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const verified = verifyGoogleState(url.searchParams.get("state"));
  if (!verified) throw new Response("This connection link is invalid or has expired.", { status: 400 });

  const { platform, shop } = verified;
  const code = url.searchParams.get("code");
  if (!code) return redirect(getIntegrationsAdminUrl(shop, "denied"));

  try {
    const tokens = await exchangeGoogleCode(code, await getGoogleCredentials(shop));
    await saveGoogleIntegration({ shop, platform: GOOGLE_PLATFORMS[platform], tokens });
    return redirect(getIntegrationsAdminUrl(shop, "connected"));
  } catch (error) {
    console.error("Google connection failed:", error.message);
    return redirect(getIntegrationsAdminUrl(shop, "failed"));
  }
};
