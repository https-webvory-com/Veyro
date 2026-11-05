import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { exchangeGoogleCode, saveGoogleIntegration } from "../services/google-oauth.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    throw new Response("Missing code or state", { status: 400 });
  }

  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    throw new Response("Invalid state", { status: 400 });
  }

  const { platform, shop } = decoded;
  if (shop !== session.shop) throw new Response("Shop mismatch", { status: 403 });

  const redirectUri = `${process.env.SHOPIFY_APP_URL}/app/tracking/google-callback`;
  const tokens = await exchangeGoogleCode(code, redirectUri);

  await saveGoogleIntegration({
    shop,
    platform: platform === "ads" ? "google_ads" : platform,
    tokens,
  });

  return redirect("/app/tracking/integrations");
};