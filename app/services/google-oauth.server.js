import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import prisma from "../db.server.js";
import { encryptKey } from "./ai-settings.server.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_MS = 10 * 60 * 1000;

export const GOOGLE_SCOPES = {
  ga4: "https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/analytics.edit",
  ads: "https://www.googleapis.com/auth/adwords",
  gtm: "https://www.googleapis.com/auth/tagmanager.readonly https://www.googleapis.com/auth/tagmanager.edit.containers",
};

// Maps the platform names used by the connect buttons to stored Integration.platform values.
export const GOOGLE_PLATFORMS = { ga4: "ga4", ads: "google_ads", gtm: "gtm" };

// Every field that is safe to return to the browser. Tokens must never be selected for a loader.
export const INTEGRATION_PUBLIC_FIELDS = {
  platform: true,
  status: true,
  accountId: true,
  accountName: true,
  updatedAt: true,
};

export function isGooglePlatform(platform) {
  return Object.hasOwn(GOOGLE_PLATFORMS, platform);
}

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function getGoogleRedirectUri() {
  return `${process.env.SHOPIFY_APP_URL}/google/callback`;
}

function stateSignature(payload) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) throw new Error("SHOPIFY_API_SECRET is not set");
  const key = Buffer.from(hkdfSync("sha256", secret, "veyro-google-oauth-v1", "oauth-state", 32));
  return createHmac("sha256", key).update(payload).digest();
}

export function createGoogleState(platform, shop, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ platform, shop, nonce: randomBytes(16).toString("hex"), exp: now + STATE_TTL_MS }),
  ).toString("base64url");
  return `${payload}.${stateSignature(payload).toString("base64url")}`;
}

// Returns { platform, shop } only for an unexpired state this app signed.
export function verifyGoogleState(state, now = Date.now()) {
  const [payload, signature, extra] = String(state || "").split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = stateSignature(payload);
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const { platform, shop, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof exp !== "number" || exp < now || !shop || !isGooglePlatform(platform)) return null;
    return { platform, shop };
  } catch {
    return null;
  }
}

export function getGoogleAuthUrl(platform, shop) {
  if (!isGooglePlatform(platform)) throw new Error("Unknown Google platform");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES[platform],
    access_type: "offline",
    prompt: "consent",
    state: createGoogleState(platform, shop),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

// Where Google sends the merchant back to, inside Shopify admin.
export function getIntegrationsAdminUrl(shop, result) {
  const store = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${store}/apps/${process.env.SHOPIFY_API_KEY}/app/tracking/integrations?google=${result}`;
}

export async function exchangeGoogleCode(code) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials missing");

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getGoogleRedirectUri(),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body });
  if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
  return res.json();
}

export async function saveGoogleIntegration({ shop, platform, tokens, accountId, accountName }, db = prisma) {
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000)
    : null;
  const accessToken = encryptKey(tokens.access_token, shop);
  const refreshToken = tokens.refresh_token ? encryptKey(tokens.refresh_token, shop) : undefined;

  return db.integration.upsert({
    where: { shop_platform: { shop, platform } },
    create: { shop, platform, status: "connected", accountId, accountName, accessToken, refreshToken, expiresAt, scopes: tokens.scope },
    update: { status: "connected", accountId, accountName, accessToken, refreshToken, expiresAt, scopes: tokens.scope },
  });
}

export async function disconnectGoogleIntegration(shop, platform, db = prisma) {
  return db.integration.deleteMany({ where: { shop, platform: GOOGLE_PLATFORMS[platform] } });
}

export async function getIntegrations(shop, db = prisma) {
  return db.integration.findMany({ where: { shop }, select: INTEGRATION_PUBLIC_FIELDS });
}
