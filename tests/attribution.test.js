/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attributeOrder,
  attributionFromGraphql,
  attributionFromWebhook,
  parseTouch,
  syncOrderAttribution,
} from "../app/services/attribution.server.js";

const shop = "demo.myshopify.com";
const channel = (landingPage, referrer, utm) => parseTouch({ landingPage, referrer, utm }, ["shop.example"]).channel;

test("Google click IDs and paid Google UTMs are Google Ads", () => {
  assert.equal(channel("https://shop.example/?gclid=abc123"), "google_ads");
  assert.equal(channel("/products/x?gbraid=g1"), "google_ads");
  assert.equal(channel("/products/x?wbraid=w1", "https://www.google.com/"), "google_ads");
  assert.equal(channel("/?utm_source=google&utm_medium=cpc&utm_campaign=sale"), "google_ads");
  const touch = parseTouch({ landingPage: "/?gclid=abc&utm_campaign=Brand" });
  assert.equal(touch.gclid, "abc");
  assert.equal(touch.utmCampaign, "Brand");
});

test("referrers without tags map to organic, social, referral, or direct", () => {
  assert.equal(channel("/", "https://www.google.com/"), "google_organic");
  assert.equal(channel("/", "https://www.google.co.uk/search?q=x"), "google_organic");
  assert.equal(channel("/", "https://www.bing.com/"), "organic_search");
  assert.equal(channel("/", "https://l.facebook.com/"), "social");
  assert.equal(channel("/", "https://t.co/abc"), "social");
  assert.equal(channel("/", "https://blog.example.org/post"), "referral");
  assert.equal(channel("/"), "direct");
  assert.equal(channel(null, null), "unknown");
});

test("own store, checkout, and payment pages are not referrers", () => {
  assert.equal(channel("https://shop.example/", "https://shop.example/collections/all"), "direct");
  assert.equal(channel("/", "https://www.shop.example/"), "direct");
  assert.equal(channel("/", "https://www.paypal.com/checkoutnow"), "direct");
  assert.equal(channel("/", "https://demo.myshopify.com/"), "direct");
});

test("UTM tags classify email, paid social, and other campaigns", () => {
  assert.equal(channel("/?utm_source=klaviyo&utm_medium=email"), "email");
  assert.equal(channel("/?utm_source=facebook&utm_medium=paid"), "paid_social");
  assert.equal(channel("/?utm_source=instagram&utm_medium=social"), "social");
  assert.equal(channel("/?utm_source=bing&utm_medium=cpc"), "microsoft_ads");
  assert.equal(channel("/?msclkid=m1"), "microsoft_ads");
  assert.equal(channel("/?utm_source=partner&utm_campaign=spring"), "campaign");
  // Shopify's journey UTMs take priority over the URL.
  assert.equal(channel("/?utm_source=x", null, { source: "google", medium: "cpc" }), "google_ads");
});

test("last non-direct visit wins, and click IDs survive from any visit", () => {
  const result = attributeOrder({
    sourceName: "web",
    firstVisit: { landingPage: "https://shop.example/?gclid=first" },
    lastVisit: { landingPage: "https://shop.example/" },
  });
  assert.equal(result.channel, "google_ads");
  assert.equal(result.firstChannel, "google_ads");
  assert.equal(result.gclid, "first");

  const mixed = attributeOrder({
    firstVisit: { landingPage: "https://shop.example/?gclid=g" },
    lastVisit: { landingPage: "https://shop.example/?utm_source=klaviyo&utm_medium=email" },
  });
  assert.equal(mixed.channel, "email");
  assert.equal(mixed.firstChannel, "google_ads");
  assert.equal(mixed.gclid, "g");
});

test("POS and draft orders are labelled by source name", () => {
  assert.equal(attributeOrder({ sourceName: "pos" }).channel, "pos");
  assert.equal(attributeOrder({ sourceName: "shopify_draft_order" }).channel, "draft_order");
  assert.equal(attributeOrder({ sourceName: "1234567" }).channel, "other");
  assert.equal(attributeOrder({}).channel, "unknown");
});

test("webhook payload uses landing_site and referring_site", () => {
  const result = attributionFromWebhook(
    { source_name: "web", landing_site: "/products/hat?utm_source=google&utm_medium=cpc&gclid=xyz", referring_site: "https://www.google.com/" },
    shop,
  );
  assert.equal(result.channel, "google_ads");
  assert.equal(result.gclid, "xyz");
  assert.equal(result.utmSource, "google");
  assert.equal(result.sourceName, "web");
});

test("GraphQL customer journey maps first and last visits", () => {
  const result = attributionFromGraphql({
    sourceName: "web",
    customerJourneySummary: {
      ready: true,
      firstVisit: { landingPage: "https://shop.example/", referrerUrl: "https://www.instagram.com/", utmParameters: null },
      lastVisit: { landingPage: "https://shop.example/?gclid=abc", referrerUrl: "https://www.google.com/", utmParameters: { source: "google", medium: "cpc", campaign: "Brand", term: null, content: null } },
    },
  }, ["shop.example"]);
  assert.equal(result.channel, "google_ads");
  assert.equal(result.firstChannel, "social");
  assert.equal(result.utmCampaign, "Brand");
  assert.equal(JSON.parse(result.attribution).first.channel, "social");
});

test("sync pages through orders and stores attribution", async () => {
  const stored = new Map();
  const db = { shopifyOrder: { upsert: async ({ where, create, update }) => {
    const key = where.shop_orderId.orderId;
    stored.set(key, stored.has(key) ? { ...stored.get(key), ...update } : create);
  } } };
  const page = (ids, hasNextPage) => ({
    shop: { primaryDomain: { host: "shop.example" } },
    orders: {
      pageInfo: { hasNextPage, endCursor: hasNextPage ? "cursor" : null },
      nodes: ids.map((id) => ({
        id: `gid://shopify/Order/${id}`, name: `#${id}`, createdAt: "2026-11-01T00:00:00Z", sourceName: "web",
        displayFinancialStatus: "PAID", displayFulfillmentStatus: "UNFULFILLED",
        currentTotalPriceSet: { shopMoney: { amount: "25.00", currencyCode: "EUR" } },
        customerJourneySummary: id === 2
          ? { ready: false, firstVisit: null, lastVisit: null }
          : { ready: true, firstVisit: null, lastVisit: { landingPage: "https://shop.example/?gclid=c", referrerUrl: null } },
      })),
    },
  });
  const calls = [];
  const admin = { graphql: async (_query, { variables }) => {
    calls.push(variables);
    return Response.json({ data: variables.after ? page([2], false) : page([1], true) });
  } };

  const result = await syncOrderAttribution({ admin, shop }, db);
  assert.equal(result.synced, 2);
  assert.deepEqual(result.pending, ["#2"]);
  assert.equal(calls[1].after, "cursor");
  assert.equal(stored.get("1").channel, "google_ads");
  assert.equal(stored.get("1").currency, "EUR");
  assert.equal(stored.get("1").financialStatus, "paid");
  assert.equal(stored.get("2").channel, "unknown");
});
