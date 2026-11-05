/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  INTEGRATION_PUBLIC_FIELDS,
  createGoogleState,
  disconnectGoogleIntegration,
  getGoogleAuthUrl,
  getIntegrationsAdminUrl,
  saveGoogleIntegration,
  verifyGoogleState,
} from "../app/services/google-oauth.server.js";
import { decryptKey } from "../app/services/ai-settings.server.js";

const shop = "demo.myshopify.com";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_API_KEY = "api-key";
process.env.SHOPIFY_APP_URL = "https://veyro.example";
process.env.GOOGLE_CLIENT_ID = "client-id";
process.env.GOOGLE_CLIENT_SECRET = "client-secret";

const flip = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);

test("state round trips only when signed by this app and unexpired", () => {
  const now = 1_000_000;
  const state = createGoogleState("ads", shop, now);
  assert.deepEqual(verifyGoogleState(state, now), { platform: "ads", shop });
  assert.equal(verifyGoogleState(state, now + 11 * 60 * 1000), null);
  const [payload, signature] = state.split(".");
  assert.equal(verifyGoogleState(`${payload}.${flip(signature)}`, now), null);
  const forged = Buffer.from(JSON.stringify({ platform: "ads", shop: "victim.myshopify.com", exp: now + 1000 })).toString("base64url");
  assert.equal(verifyGoogleState(`${forged}.${signature}`, now), null);
  assert.equal(verifyGoogleState(forged, now), null);
  assert.equal(verifyGoogleState(null, now), null);
});

test("state with an unknown platform is rejected even when correctly signed", () => {
  assert.equal(verifyGoogleState(createGoogleState("constructor", shop)), null);
  assert.equal(verifyGoogleState(createGoogleState("foo", shop)), null);
});

test("auth URL requests offline access for the right scopes and a verifiable state", () => {
  const url = new URL(getGoogleAuthUrl("gtm", shop));
  assert.equal(url.searchParams.get("redirect_uri"), "https://veyro.example/google/callback");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.match(url.searchParams.get("scope"), /tagmanager/);
  assert.deepEqual(verifyGoogleState(url.searchParams.get("state")), { platform: "gtm", shop });
  assert.throws(() => getGoogleAuthUrl("foo", shop));
});

test("tokens are encrypted at rest and a refresh without a new refresh token keeps the old one", async () => {
  const calls = [];
  const db = { integration: { upsert: async (args) => { calls.push(args); return args; } } };
  await saveGoogleIntegration({ shop, platform: "gtm", tokens: { access_token: "AT", refresh_token: "RT", expires_in: 3600, scope: "s" } }, db);
  const { create, update } = calls[0];
  assert.notEqual(create.accessToken, "AT");
  assert.notEqual(create.refreshToken, "RT");
  assert.equal(decryptKey(create.accessToken, shop), "AT");
  assert.equal(decryptKey(create.refreshToken, shop), "RT");
  assert.throws(() => decryptKey(create.accessToken, "other.myshopify.com"));
  await saveGoogleIntegration({ shop, platform: "gtm", tokens: { access_token: "AT2" } }, db);
  assert.equal(calls[1].update.refreshToken, undefined);
  assert.equal(update.status, "connected");
});

test("fields returned to the browser never include tokens", () => {
  for (const field of ["accessToken", "refreshToken", "scopes", "expiresAt"]) assert.equal(INTEGRATION_PUBLIC_FIELDS[field], undefined);
});

test("disconnect removes only the chosen service for that shop", async () => {
  let where;
  await disconnectGoogleIntegration(shop, "ads", { integration: { deleteMany: async (args) => { where = args.where; } } });
  assert.deepEqual(where, { shop, platform: "google_ads" });
});

test("admin return URL uses the store handle and stays on the integrations page", () => {
  assert.equal(getIntegrationsAdminUrl(shop, "connected"), "https://admin.shopify.com/store/demo/apps/api-key/app/tracking/integrations?google=connected");
});
