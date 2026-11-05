import db from "../db.server";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_SCOPES = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics.edit",
  ads: "https://www.googleapis.com/auth/adwords",
  gtm: "https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/tagmanager.edit.containers",
};

export function getGoogleAuthUrl(platform, shop, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  const scopes = GOOGLE_SCOPES[platform] || GOOGLE_SCOPES.ga4;
  const state = Buffer.from(JSON.stringify({ platform, shop })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials missing");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  return res.json();
}

export async function saveGoogleIntegration({ shop, platform, tokens, accountId, accountName }) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;

  return db.integration.upsert({
    where: { shop_platform: { shop, platform } },
    create: {
      shop,
      platform,
      status: "connected",
      accountId,
      accountName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scopes: tokens.scope,
    },
    update: {
      status: "connected",
      accountId,
      accountName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiresAt,
      scopes: tokens.scope,
    },
  });
}

export async function getIntegrations(shop) {
  return db.integration.findMany({ where: { shop } });
}