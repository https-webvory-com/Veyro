/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  attributeOrder,
  attributionFromGraphql,
  attributionFromWebhook,
  classifyTouch,
  computeAttribution,
  parseTouch,
  reapplyAttribution,
  setDefaultModel,
  storedRaw,
  syncOrderAttribution,
  validateRule,
} from "../app/services/attribution.server.js";
import { CHANNELS, CHANNEL_GROUPS, channelInfo } from "../app/services/channels.js";

const shop = "demo.myshopify.com";
const touch = (landingPage, referrer, utm) => parseTouch({ landingPage, referrer, utm }, ["shop.example"]);
const channel = (landingPage, referrer, utm, rules) => classifyTouch(touch(landingPage, referrer, utm), rules).channel;

test("every channel belongs to a known group", () => {
  for (const [key, ch] of Object.entries(CHANNELS)) assert.ok(CHANNEL_GROUPS[ch.group], key);
  assert.equal(channelInfo("paid_social").key, "other_paid_social");
  assert.equal(channelInfo("nonsense").key, "unknown");
});

test("ad click IDs identify the ad network", () => {
  assert.equal(channel("https://shop.example/?gclid=abc"), "google_ads");
  assert.equal(channel("/p?gbraid=g"), "google_ads");
  assert.equal(channel("/p?wbraid=w", "https://www.google.com/"), "google_ads");
  assert.equal(channel("/p?gclid=a&utm_source=youtube&utm_medium=cpc"), "youtube_ads");
  assert.equal(channel("/p?msclkid=m"), "microsoft_ads");
  assert.equal(channel("/p?ttclid=t"), "tiktok_ads");
  assert.equal(channel("/p?ScCid=s"), "snapchat_ads");
  assert.equal(channel("/p?epik=e"), "pinterest_ads");
  assert.equal(channel("/p?li_fat_id=l"), "linkedin_ads");
  assert.equal(channel("/p?awc=1234_abc"), "awin");
  assert.equal(channel("/p?irclickid=x"), "other_affiliate");
  const t = touch("/p?ttclid=t&epik=e&li_fat_id=l&ScCid=s&utm_id=42");
  assert.deepEqual([t.ttclid, t.epik, t.liFatId, t.scCid, t.utmId], ["t", "e", "l", "s", "42"]);
});

test("paid UTM tags map to each network", () => {
  const paid = (source, medium = "cpc") => channel(`/?utm_source=${source}&utm_medium=${medium}`);
  assert.equal(paid("google"), "google_ads");
  assert.equal(paid("bing"), "microsoft_ads");
  assert.equal(paid("facebook", "paid_social"), "facebook_ads");
  assert.equal(paid("fb", "paid"), "facebook_ads");
  assert.equal(paid("instagram", "paid"), "instagram_ads");
  assert.equal(paid("ig", "cpm"), "instagram_ads");
  assert.equal(paid("pinterest", "paid"), "pinterest_ads");
  assert.equal(paid("tiktok", "paid"), "tiktok_ads");
  assert.equal(paid("snapchat", "paid"), "snapchat_ads");
  assert.equal(paid("youtube", "paid"), "youtube_ads");
  assert.equal(paid("linkedin", "paid"), "linkedin_ads");
  assert.equal(paid("duckduckgo"), "other_paid_search");
  assert.equal(paid("somenetwork", "paid_social"), "other_paid_social");
  assert.equal(paid("somenetwork", "cpc"), "other_paid_search");
  assert.equal(paid("somenetwork", "display"), "campaign");
});

test("email and SMS tags identify the platform", () => {
  assert.equal(channel("/?utm_source=klaviyo&utm_medium=email"), "klaviyo_email");
  assert.equal(channel("/?utm_source=Spring%20Sale&utm_medium=email&_kx=abc"), "klaviyo_email");
  assert.equal(channel("/?utm_source=omnisend&utm_medium=email"), "omnisend_email");
  assert.equal(channel("/?utm_source=shopify_email&utm_medium=email"), "shopify_email");
  assert.equal(channel("/?utm_source=newsletter&utm_medium=email"), "other_email");
  assert.equal(channel("/?utm_source=klaviyo"), "klaviyo_email");
  assert.equal(channel("/?utm_source=shopify"), "campaign");
  assert.equal(channel("/?utm_source=klaviyo&utm_medium=sms"), "klaviyo_sms");
  assert.equal(channel("/?utm_source=omnisend&utm_medium=sms"), "omnisend_sms");
  assert.equal(channel("/?utm_source=postscript&utm_medium=sms"), "other_sms");
  assert.equal(channel("/?_kx=abc"), "klaviyo_email");
});

test("affiliate, influencer, QR, offline, organic, and referral tags", () => {
  assert.equal(channel("/?utm_source=awin&utm_medium=affiliate"), "awin");
  assert.equal(channel("/?utm_source=partnerize&utm_medium=affiliate"), "other_affiliate");
  assert.equal(channel("/?utm_source=influencer_jane&utm_medium=affiliate"), "influencer_affiliate");
  assert.equal(channel("/?utm_source=jane&utm_medium=influencer"), "influencer");
  assert.equal(channel("/?utm_source=store_window&utm_medium=qr"), "qr_code");
  assert.equal(channel("/?utm_source=magazine&utm_medium=print"), "offline");
  assert.equal(channel("/?utm_source=instagram&utm_medium=social"), "instagram_organic");
  assert.equal(channel("/?utm_source=tiktok"), "tiktok_organic");
  assert.equal(channel("/?utm_source=x&utm_medium=social"), "other_social");
  assert.equal(channel("/?utm_source=google&utm_medium=organic"), "google_organic");
  assert.equal(channel("/?utm_source=bing&utm_medium=organic"), "bing_organic");
  assert.equal(channel("/?utm_source=blog&utm_medium=referral"), "referral");
  assert.equal(channel("/?utm_campaign=spring"), "campaign");
});

test("referring websites map to organic search, social, email, or referral", () => {
  assert.equal(channel("/", "https://www.google.co.uk/search?q=x"), "google_organic");
  assert.equal(channel("/", "android-app://com.google.android.googlequicksearchbox/"), "google_organic");
  assert.equal(channel("/", "https://www.bing.com/"), "bing_organic");
  assert.equal(channel("/", "https://search.yahoo.com/"), "yahoo_organic");
  assert.equal(channel("/", "https://duckduckgo.com/"), "duckduckgo_organic");
  assert.equal(channel("/", "https://www.ecosia.org/"), "other_search");
  assert.equal(channel("/", "https://l.facebook.com/"), "facebook_organic");
  assert.equal(channel("/", "https://l.instagram.com/"), "instagram_organic");
  assert.equal(channel("/", "https://pin.it/x"), "pinterest_organic");
  assert.equal(channel("/", "https://www.tiktok.com/"), "tiktok_organic");
  assert.equal(channel("/", "https://m.youtube.com/watch"), "youtube_organic");
  assert.equal(channel("/", "https://t.co/abc"), "other_social");
  assert.equal(channel("/", "https://mail.google.com/"), "other_email");
  assert.equal(channel("/", "android-app://com.google.android.gm/"), "other_email");
  assert.equal(channel("/", "https://blog.example.org/post"), "referral");
  assert.equal(channel("/?fbclid=f"), "facebook_organic");
  assert.equal(channel("/"), "direct");
  assert.equal(channel(null, null), "unknown");
});

test("own store, checkout, and payment pages are not referrers", () => {
  assert.equal(channel("https://shop.example/", "https://shop.example/collections/all"), "direct");
  assert.equal(channel("/", "https://www.shop.example/"), "direct");
  assert.equal(channel("/", "https://www.paypal.com/checkoutnow"), "direct");
});

test("merchant rules run first, in order, and only when enabled", () => {
  const rules = [
    { name: "Off rule", field: "utm_source", operator: "equals", value: "partnerx", channel: "awin", enabled: false },
    { name: "Partner X", field: "utm_source", operator: "contains", value: "PARTNER", channel: "influencer" },
    { name: "Second", field: "utm_source", operator: "contains", value: "partner", channel: "qr_code" },
    { name: "Blog", field: "referrer", operator: "equals", value: "blog.example.org", channel: "influencer_affiliate" },
    { name: "Landing", field: "landing_page", operator: "contains", value: "/pages/tv", channel: "offline" },
  ];
  const result = classifyTouch(touch("/?utm_source=partnerx&utm_medium=cpc&gclid=1"), rules);
  assert.equal(result.channel, "influencer");
  assert.equal(result.confidence, "high");
  assert.match(result.evidence, /Partner X/);
  assert.equal(channel("/", "https://blog.example.org/x", undefined, rules), "influencer_affiliate");
  assert.equal(channel("/pages/tv-offer", undefined, undefined, rules), "offline");
});

test("rule validation rejects incomplete rules and names good ones", () => {
  assert.match(validateRule({ field: "x", operator: "equals", value: "a", channel: "awin" }).error, /look at/);
  assert.match(validateRule({ field: "utm_source", operator: "equals", value: " ", channel: "awin" }).error, /value/);
  assert.match(validateRule({ field: "utm_source", operator: "equals", value: "a", channel: "unknown" }).error, /channel/);
  assert.equal(validateRule({ field: "utm_source", operator: "contains", value: "awin", channel: "awin" }).rule.name, 'UTM source contains "awin"');
});

test("status and confidence follow the strength of the evidence", () => {
  const status = (visit, extra = {}) => attributeOrder({ lastVisit: visit, ...extra });
  assert.equal(status({ landingPage: "/?gclid=1" }).attributionStatus, "attributed");
  assert.equal(status({ landingPage: "/?gclid=1" }).attributionConfidence, "high");
  assert.equal(status({ landingPage: "/", referrer: "https://www.google.com/" }).attributionStatus, "partially_attributed");
  assert.equal(status({ landingPage: "/" }).attributionStatus, "unattributed");
  assert.equal(status(null, { ready: false }).attributionStatus, "pending_enrichment");
  assert.equal(status(null).attributionStatus, "unknown");
  const pos = attributeOrder({ sourceName: "pos" });
  assert.deepEqual([pos.channel, pos.attributionStatus, pos.attributionConfidence], ["pos", "attributed", "high"]);
  assert.match(status(null, { sourceName: "1234" }).attributionEvidence, /1234/);
});

test("each model credits a different visit, and the default picks the stored channel", () => {
  const visits = {
    firstVisit: { landingPage: "/?utm_source=instagram&utm_medium=social" },
    lastVisit: { landingPage: "/" },
  };
  const lnd = attributeOrder(visits);
  assert.deepEqual([lnd.firstChannel, lnd.lastChannel, lnd.lastNonDirectChannel, lnd.channel], ["instagram_organic", "direct", "instagram_organic", "instagram_organic"]);
  assert.equal(attributeOrder({ ...visits, model: "last_touch" }).channel, "direct");
  assert.equal(attributeOrder({ ...visits, model: "first_touch" }).channel, "instagram_organic");

  const mixed = attributeOrder({ firstVisit: { landingPage: "/?gclid=g" }, lastVisit: { landingPage: "/?utm_source=klaviyo&utm_medium=email" } });
  assert.equal(mixed.channel, "klaviyo_email");
  assert.equal(mixed.gclid, "g", "click IDs from any visit are kept");
});

test("webhook and GraphQL payloads are attributed with the store's rules", () => {
  const rules = [{ name: "VIP", field: "utm_campaign", operator: "equals", value: "vip", channel: "influencer" }];
  const hook = attributionFromWebhook({ source_name: "web", landing_site: "/products/hat?utm_campaign=vip", referring_site: "https://www.google.com/" }, shop, { rules });
  assert.equal(hook.channel, "influencer");

  const gql = attributionFromGraphql({
    sourceName: "web",
    customerJourneySummary: {
      ready: true,
      firstVisit: { landingPage: "https://shop.example/", referrerUrl: "https://www.instagram.com/", utmParameters: null },
      lastVisit: { landingPage: "https://shop.example/?gclid=abc", referrerUrl: "https://www.google.com/", utmParameters: { source: "google", medium: "cpc", campaign: "Brand", term: null, content: null } },
    },
  }, ["shop.example"]);
  assert.equal(gql.channel, "google_ads");
  assert.equal(gql.firstChannel, "instagram_organic");
  assert.equal(gql.utmCampaign, "Brand");
  assert.equal(JSON.parse(gql.attribution).v, 2);
});

test("orders stored by the first release are upgraded from their saved visits", () => {
  const legacy = { attribution: JSON.stringify({ first: null, last: { landingPage: "https://shop.example/?ttclid=t", referrer: null, utmSource: "tiktok", utmMedium: "paid" } }), sourceName: "web" };
  const result = computeAttribution(storedRaw(legacy, shop));
  assert.equal(result.channel, "tiktok_ads");
  assert.equal(result.ttclid, "t");
  assert.equal(computeAttribution(storedRaw({ attribution: "not json", sourceName: "pos" }, shop)).channel, "pos");
});

function fakeDb(rows = [], { rules = [], settings = null } = {}) {
  const stored = new Map(rows.map((r) => [r.id, { ...r }]));
  const raw = [];
  return {
    stored,
    raw,
    attributionSettings: {
      findUnique: async () => settings,
      upsert: async ({ create }) => { settings = create; },
    },
    channelRule: { findMany: async () => rules },
    shopifyOrder: {
      findMany: async ({ take, cursor }) => {
        const all = [...stored.values()].sort((a, b) => a.id.localeCompare(b.id));
        const start = cursor ? all.findIndex((r) => r.id === cursor.id) + 1 : 0;
        return all.slice(start, start + take);
      },
      update: async ({ where, data }) => stored.set(where.id, { ...stored.get(where.id), ...data }),
      upsert: async ({ where, create, update }) => {
        const key = where.shop_orderId.orderId;
        stored.set(key, stored.has(key) ? { ...stored.get(key), ...update } : create);
      },
    },
    $transaction: async (ops) => Promise.all(ops),
    $executeRawUnsafe: async (sql, ...args) => raw.push([sql, ...args]),
  };
}

test("reapply recomputes every stored order with the current rules", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, sourceName: "web", attribution: JSON.stringify({ v: 2, first: null, last: { landingPage: "/?utm_source=partnerx", referrer: null, utm: {} }, sourceName: "web", hosts: [shop] }) }));
  const db = fakeDb(rows, { rules: [{ name: "X", field: "utm_source", operator: "equals", value: "partnerx", channel: "awin", enabled: true }] });
  assert.equal(await reapplyAttribution(shop, db, 2), 5);
  for (const row of db.stored.values()) assert.equal(row.channel, "awin");
});

test("changing the default model copies the matching column, from a fixed list only", async () => {
  const db = fakeDb();
  assert.match((await setDefaultModel(shop, "first_touch", db)).message, /first click/);
  assert.deepEqual(db.raw[0], ['UPDATE "ShopifyOrder" SET "channel" = "firstChannel" WHERE "shop" = $1', shop]);
  assert.ok((await setDefaultModel(shop, 'x"; DROP TABLE', db)).error);
  assert.equal(db.raw.length, 1);
});

test("sync pages through orders and stores attribution", async () => {
  const db = fakeDb();
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
  assert.equal(db.stored.get("1").channel, "google_ads");
  assert.equal(db.stored.get("1").currency, "EUR");
  assert.equal(db.stored.get("2").attributionStatus, "pending_enrichment");
});
