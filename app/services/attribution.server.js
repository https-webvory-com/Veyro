import prisma from "../db.server.js";
import { graphql } from "./shopify-api.server.js";
import { CHANNELS } from "./channels.js";

export { CHANNELS };

const CLICK_IDS = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"];
const UTM_KEYS = ["source", "medium", "campaign", "term", "content"];
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "paid-search", "cpm", "paidsocial", "paid_social", "paid-social", "display", "ads", "ad"]);
const SEARCH_HOSTS = ["bing.", "yahoo.", "duckduckgo.", "baidu.", "yandex.", "ecosia.", "ask.", "aol."];
const SOCIAL_HOSTS = ["facebook.", "fb.", "instagram.", "t.co", "twitter.", "x.com", "pinterest.", "tiktok.", "youtube.", "youtu.be", "linkedin.", "lnkd.in", "reddit.", "snapchat.", "threads.net", "whatsapp."];
const SOCIAL_SOURCES = ["facebook", "fb", "instagram", "ig", "meta", "twitter", "x", "pinterest", "tiktok", "youtube", "linkedin", "reddit", "snapchat", "threads"];
// Payment and checkout pages send buyers back to the store; they are not where the buyer came from.
const INTERNAL_HOSTS = ["checkout.shopify.com", "shopify.com", "myshopify.com", "paypal.com", "stripe.com", "klarna.com", "afterpay.com", "affirm.com", "shop.app"];

const BASE = "https://store.invalid";

function toUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value.trim(), BASE);
  } catch {
    return null;
  }
}

function hostMatches(host, patterns) {
  return patterns.some((p) => (p.endsWith(".") ? host.startsWith(p) || host.includes(`.${p}`) : host === p || host.endsWith(`.${p}`)));
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

// One visit: where the buyer landed, who sent them, and any campaign tags.
// `utm` may come from Shopify's customer journey; tags in the landing URL fill any gaps.
export function parseTouch({ landingPage, referrer, utm } = {}, ownHosts = []) {
  const landing = toUrl(landingPage);
  const ref = toUrl(referrer);
  const params = landing?.searchParams;

  const touch = { landingPage: clean(landingPage, 2000), referrer: clean(referrer, 2000) };
  for (const key of UTM_KEYS) touch[`utm${key[0].toUpperCase()}${key.slice(1)}`] = clean(utm?.[key]) ?? clean(params?.get(`utm_${key}`));
  for (const id of CLICK_IDS) touch[id] = clean(params?.get(id));

  const landingHost = landing && landing.origin !== BASE ? landing.hostname.toLowerCase() : null;
  const own = [landingHost, ...ownHosts].filter(Boolean).map((h) => h.toLowerCase());
  const refHost = ref && ref.origin !== BASE ? ref.hostname.toLowerCase().replace(/^www\./, "") : null;
  touch.referrerHost = refHost && !own.includes(refHost) && !own.includes(`www.${refHost}`) && !hostMatches(refHost, INTERNAL_HOSTS) ? refHost : null;

  touch.channel = classifyTouch(touch);
  return touch;
}

export function classifyTouch(t) {
  const source = (t.utmSource || "").toLowerCase();
  const medium = (t.utmMedium || "").toLowerCase();
  const paid = PAID_MEDIUMS.has(medium);
  const host = t.referrerHost || "";

  if (t.gclid || t.gbraid || t.wbraid) return "google_ads";
  if (t.msclkid) return "microsoft_ads";
  if (paid && ["google", "adwords", "googleads", "google_ads"].includes(source)) return "google_ads";
  if (paid && ["bing", "microsoft"].includes(source)) return "microsoft_ads";
  if (paid && SOCIAL_SOURCES.includes(source)) return "paid_social";
  if (medium === "email" || medium === "newsletter" || source === "klaviyo" || source === "mailchimp") return "email";
  if (t.utmSource || t.utmMedium || t.utmCampaign) {
    if (SOCIAL_SOURCES.includes(source) || medium === "social") return "social";
    if (paid) return "campaign";
    if (medium === "organic" && source === "google") return "google_organic";
    return "campaign";
  }
  if (host) {
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google_organic";
    if (hostMatches(host, SEARCH_HOSTS)) return "organic_search";
    if (hostMatches(host, SOCIAL_HOSTS)) return "social";
    return "referral";
  }
  if (t.fbclid) return "social";
  return t.landingPage ? "direct" : "unknown";
}

// Shopify source_name values that never came through the online store.
function nonWebChannel(sourceName) {
  const name = String(sourceName || "").toLowerCase();
  if (name === "pos") return "pos";
  if (name === "shopify_draft_order") return "draft_order";
  return null;
}

// Last non-direct click wins; the first visit is kept so first-touch reports stay possible.
export function attributeOrder({ sourceName, firstVisit, lastVisit, ownHosts = [] }) {
  const first = firstVisit ? parseTouch(firstVisit, ownHosts) : null;
  const last = lastVisit ? parseTouch(lastVisit, ownHosts) : null;
  const weak = (t) => !t || t.channel === "direct" || t.channel === "unknown";
  const winner = !weak(last) ? last : !weak(first) ? first : last || first;

  const channel = nonWebChannel(sourceName) || (winner && winner.channel !== "unknown" ? winner.channel : sourceName && String(sourceName).toLowerCase() !== "web" ? "other" : "unknown");
  // A click ID from any visit is still uploadable to the ad platform, even if another channel won.
  const pick = (key) => winner?.[key] ?? last?.[key] ?? first?.[key] ?? null;

  return {
    channel,
    firstChannel: first?.channel ?? null,
    utmSource: winner?.utmSource ?? null,
    utmMedium: winner?.utmMedium ?? null,
    utmCampaign: winner?.utmCampaign ?? null,
    utmTerm: winner?.utmTerm ?? null,
    utmContent: winner?.utmContent ?? null,
    gclid: pick("gclid"),
    gbraid: pick("gbraid"),
    wbraid: pick("wbraid"),
    msclkid: pick("msclkid"),
    fbclid: pick("fbclid"),
    landingSite: winner?.landingPage ?? null,
    referringSite: winner?.referrer ?? null,
    sourceName: clean(sourceName, 100),
    attribution: JSON.stringify({ first, last }),
  };
}

// Order webhook (REST) payload. Shopify only sends the session that placed the order.
export function attributionFromWebhook(order, shop) {
  const visit = order.landing_site || order.referring_site ? { landingPage: order.landing_site, referrer: order.referring_site } : null;
  return attributeOrder({ sourceName: order.source_name, lastVisit: visit, ownHosts: [shop] });
}

function journeyVisit(visit) {
  if (!visit) return null;
  return { landingPage: visit.landingPage, referrer: visit.referrerUrl, utm: visit.utmParameters || undefined };
}

// Admin GraphQL order with customerJourneySummary.
export function attributionFromGraphql(order, ownHosts = []) {
  const journey = order.customerJourneySummary;
  return attributeOrder({
    sourceName: order.sourceName,
    firstVisit: journeyVisit(journey?.firstVisit),
    lastVisit: journeyVisit(journey?.lastVisit),
    ownHosts,
  });
}

const VISIT_FIELDS = `landingPage referrerUrl source sourceType utmParameters { source medium campaign term content }`;
export const ORDERS_ATTRIBUTION_QUERY = `#graphql
  query VeyroOrdersAttribution($first: Int!, $after: String) {
    shop { primaryDomain { host } }
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id name createdAt sourceName
        displayFinancialStatus displayFulfillmentStatus
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        currentSubtotalPriceSet { shopMoney { amount } }
        currentTotalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        customerJourneySummary { ready firstVisit { ${VISIT_FIELDS} } lastVisit { ${VISIT_FIELDS} } }
      }
    }
  }`;

const money = (set) => parseFloat(set?.shopMoney?.amount || 0);

// Pulls recent orders with their customer journey and stores the attribution.
export async function syncOrderAttribution({ admin, shop, limit = 250 }, db = prisma) {
  let after = null;
  let synced = 0;
  const pending = [];

  while (synced < limit) {
    const data = await graphql(admin, ORDERS_ATTRIBUTION_QUERY, { first: Math.min(50, limit - synced), after });
    const ownHosts = [shop, data.shop?.primaryDomain?.host].filter(Boolean);

    for (const order of data.orders.nodes) {
      const orderId = order.id.split("/").pop();
      const fields = attributionFromGraphql(order, ownHosts);
      if (order.customerJourneySummary && !order.customerJourneySummary.ready) pending.push(order.name);
      const base = {
        orderNumber: order.name?.replace(/^#/, "") || null,
        totalPrice: money(order.currentTotalPriceSet),
        subtotalPrice: money(order.currentSubtotalPriceSet),
        totalTax: money(order.currentTotalTaxSet),
        totalShipping: money(order.totalShippingPriceSet),
        currency: order.currentTotalPriceSet?.shopMoney?.currencyCode || "USD",
        financialStatus: order.displayFinancialStatus?.toLowerCase() || null,
        fulfillmentStatus: order.displayFulfillmentStatus?.toLowerCase() || null,
      };
      await db.shopifyOrder.upsert({
        where: { shop_orderId: { shop, orderId } },
        create: { shop, orderId, createdAt: new Date(order.createdAt), ...base, ...fields },
        update: { ...base, ...fields },
      });
      synced += 1;
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    after = data.orders.pageInfo.endCursor;
  }

  return { synced, pending };
}

// Orders and revenue per channel, newest window first.
export async function getChannelBreakdown(shop, { since } = {}, db = prisma) {
  const rows = await db.shopifyOrder.groupBy({
    by: ["channel"],
    where: { shop, ...(since ? { createdAt: { gte: since } } : {}) },
    _count: { _all: true },
    _sum: { totalPrice: true },
  });
  const total = rows.reduce((n, r) => n + r._count._all, 0);
  return rows
    .map((r) => {
      const channel = r.channel || "unknown";
      return { channel, label: CHANNELS[channel] || channel, orders: r._count._all, revenue: r._sum.totalPrice || 0, share: total ? r._count._all / total : 0 };
    })
    .sort((a, b) => b.orders - a.orders);
}

export async function getCampaignBreakdown(shop, { take = 10 } = {}, db = prisma) {
  const rows = await db.shopifyOrder.groupBy({
    by: ["channel", "utmSource", "utmCampaign"],
    where: { shop, utmCampaign: { not: null } },
    _count: { _all: true },
    _sum: { totalPrice: true },
  });
  return rows
    .map((r) => ({ channel: r.channel, label: CHANNELS[r.channel] || r.channel, source: r.utmSource, campaign: r.utmCampaign, orders: r._count._all, revenue: r._sum.totalPrice || 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, take);
}
