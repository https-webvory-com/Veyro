/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  INTEGRATION_PUBLIC_FIELDS,
  createGoogleState,
  disconnectGoogleIntegration,
  exchangeGoogleCode,
  getGoogleAuthUrl,
  getGoogleCredentialStatus,
  getGoogleCredentials,
  getIntegrationsAdminUrl,
  removeGoogleCredentials,
  saveGoogleCredentials,
  saveGoogleIntegration,
  verifyGoogleState,
} from "../app/services/google-oauth.server.js";
import { decryptKey } from "../app/services/ai-settings.server.js";

const shop = "demo.myshopify.com";
const otherShop = "other.myshopify.com";
const clientId = "123-abc.apps.googleusercontent.com";
process.env.SHOPIFY_API_SECRET = "test-secret";
process.env.SHOPIFY_API_KEY = "api-key";
process.env.SHOPIFY_APP_URL = "https://veyro.example";

const flip = (s) => (s[0] === "A" ? "B" : "A") + s.slice(1);

// In-memory stand-in for the two tables these services touch.
function fakeDb() {
  const credentials = new Map();
  const integrations = [{ shop, platform: "ga4" }, { shop, platform: "gtm" }, { shop: otherShop, platform: "ga4" }];
  const db = {
    integrations,
    credentials,
    googleCredential: {
      findUnique: async ({ where }) => credentials.get(where.shop) || null,
      upsert: async ({ where, create, update }) => {
        const next = { ...(credentials.get(where.shop) || create), ...update };
        credentials.set(where.shop, next);
        return next;
      },
      deleteMany: async ({ where }) => { credentials.delete(where.shop); },
    },
    integration: {
      deleteMany: async ({ where }) => {
        for (let i = integrations.length - 1; i >= 0; i--) if (integrations[i].shop === where.shop) integrations.splice(i, 1);
      },
    },
    $transaction: async (work) => work(db),
  };
  return db;
}

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

test("auth URL uses the store's client ID, offline access, and a verifiable state", () => {
  const url = new URL(getGoogleAuthUrl("gtm", shop, clientId));
  assert.equal(url.searchParams.get("client_id"), clientId);
  assert.equal(url.searchParams.get("redirect_uri"), "https://veyro.example/google/callback");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.match(url.searchParams.get("scope"), /tagmanager/);
  assert.deepEqual(verifyGoogleState(url.searchParams.get("state")), { platform: "gtm", shop });
  assert.throws(() => getGoogleAuthUrl("foo", shop, clientId));
  assert.throws(() => getGoogleAuthUrl("gtm", shop, ""));
});

test("each store keeps its own credentials, and a secret only decrypts for its store", async () => {
  const db = fakeDb();
  await saveGoogleCredentials({ shop, clientId, clientSecret: "secret-for-demo" }, db);
  await saveGoogleCredentials({ shop: otherShop, clientId: "999-zzz.apps.googleusercontent.com", clientSecret: "secret-for-other" }, db);

  assert.deepEqual(await getGoogleCredentials(shop, db), { clientId, clientSecret: "secret-for-demo" });
  assert.deepEqual(await getGoogleCredentials(otherShop, db), { clientId: "999-zzz.apps.googleusercontent.com", clientSecret: "secret-for-other" });
  assert.ok(!db.credentials.get(shop).encryptedSecret.includes("secret-for-demo"));
  assert.throws(() => decryptKey(db.credentials.get(shop).encryptedSecret, otherShop));
  await assert.rejects(getGoogleCredentials("none.myshopify.com", db));
});

test("credential status never exposes the secret and reports unreadable secrets as not configured", async () => {
  const db = fakeDb();
  assert.deepEqual(await getGoogleCredentialStatus(shop, db), { configured: false, clientId: "" });
  await saveGoogleCredentials({ shop, clientId, clientSecret: "secret-for-demo" }, db);
  const status = await getGoogleCredentialStatus(shop, db);
  assert.deepEqual(status, { configured: true, clientId });
  db.credentials.get(shop).encryptedSecret = "v1.broken.broken.broken";
  assert.deepEqual(await getGoogleCredentialStatus(shop, db), { configured: false, clientId });
});

test("invalid credentials are rejected without saving", async () => {
  const db = fakeDb();
  for (const input of [
    { clientId: "not-a-client-id", clientSecret: "secret-for-demo" },
    { clientId: "evil.example.com", clientSecret: "secret-for-demo" },
    { clientId, clientSecret: "short" },
    { clientId, clientSecret: "has spaces in it" },
    { clientId, clientSecret: "" },
  ]) {
    assert.ok((await saveGoogleCredentials({ shop, ...input }, db)).error);
  }
  assert.equal(db.credentials.size, 0);
});

test("a blank secret keeps the saved one only for the same client", async () => {
  const db = fakeDb();
  await saveGoogleCredentials({ shop, clientId, clientSecret: "secret-for-demo" }, db);
  assert.ok((await saveGoogleCredentials({ shop, clientId, clientSecret: "" }, db)).message);
  assert.equal((await getGoogleCredentials(shop, db)).clientSecret, "secret-for-demo");
  assert.equal(db.integrations.length, 3);
  assert.ok((await saveGoogleCredentials({ shop, clientId: "555-new.apps.googleusercontent.com", clientSecret: "" }, db)).error);
});

test("changing or removing a client disconnects only that store", async () => {
  const db = fakeDb();
  await saveGoogleCredentials({ shop, clientId, clientSecret: "secret-for-demo" }, db);
  assert.equal(db.integrations.length, 3);
  await saveGoogleCredentials({ shop, clientId: "555-new.apps.googleusercontent.com", clientSecret: "new-secret-value" }, db);
  assert.deepEqual(db.integrations, [{ shop: otherShop, platform: "ga4" }]);

  const second = fakeDb();
  await saveGoogleCredentials({ shop, clientId, clientSecret: "secret-for-demo" }, second);
  await removeGoogleCredentials(shop, second);
  assert.equal(second.credentials.size, 0);
  assert.deepEqual(second.integrations, [{ shop: otherShop, platform: "ga4" }]);
});

test("token exchange sends the store's own client credentials", async (t) => {
  const fetchMock = t.mock.method(global, "fetch", async () => Response.json({ access_token: "AT" }));
  await exchangeGoogleCode("the-code", { clientId, clientSecret: "secret-for-demo" });
  const body = new URLSearchParams(fetchMock.mock.calls[0].arguments[1].body.toString());
  assert.equal(body.get("client_id"), clientId);
  assert.equal(body.get("client_secret"), "secret-for-demo");
  assert.equal(body.get("code"), "the-code");
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
  assert.throws(() => decryptKey(create.accessToken, otherShop));
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
