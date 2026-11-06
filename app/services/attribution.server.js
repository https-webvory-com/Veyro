import prisma from "../db.server.js";
import { graphql } from "./shopify-api.server.js";
import { CHANNELS, CHANNEL_GROUPS, DEFAULT_MODEL, MODELS, RULE_FIELDS, RULE_OPERATORS, STATUSES, channelInfo } from "./channels.js";

export { CHANNELS };

// Which stored column holds the channel for each attribution model.
export const MODEL_COLUMNS = { first_touch: "firstChannel", last_touch: "lastChannel", last_non_direct: "lastNonDirectChannel" };

const BASE = "https://store.invalid";
const UTM_KEYS = ["source", "medium", "campaign", "term", "content", "id"];
const AFFILIATE_PARAMS = ["irclickid", "cjevent", "sscid"];
// Payment and checkout pages send buyers back to the store; they are not where the buyer came from.
const INTERNAL_HOSTS = ["checkout.shopify.com", "shopify.com", "myshopify.com", "paypal.com", "stripe.com", "klarna.com", "afterpay.com", "affirm.com", "shop.app"];

const PAID_SEARCH_MEDIUMS = new Set(["cpc", "ppc", "paidsearch", "paid_search", "paid-search", "sem"]);
const PAID_SOCIAL_MEDIUMS = new Set(["paid_social", "paidsocial", "paid-social", "social_paid", "social-paid", "paid_media", "paid-media"]);
const PAID_MEDIUMS = new Set([...PAID_SEARCH_MEDIUMS, ...PAID_SOCIAL_MEDIUMS, "paid", "cpm", "cpv", "display", "ads", "ad", "retargeting", "remarketing"]);
const SMS_MEDIUMS = new Set(["sms", "text", "txt", "mms"]);
const EMAIL_MEDIUMS = new Set(["email", "e-mail", "e_mail", "newsletter", "mail"]);
const AFFILIATE_MEDIUMS = new Set(["affiliate", "affiliates", "partner", "partners", "affiliation"]);
const INFLUENCER_MEDIUMS = new Set(["influencer", "influencers", "creator", "creators", "ugc"]);
const QR_VALUES = new Set(["qr", "qrcode", "qr_code", "qr-code"]);
const OFFLINE_MEDIUMS = new Set(["print", "offline", "direct_mail", "direct-mail", "directmail", "flyer", "poster", "tv", "radio", "billboard", "event", "packaging", "insert"]);
const SOCIAL_MEDIUMS = new Set(["social", "social-network", "social_network", "socialmedia", "social-media", "social_media", "organic_social", "organic-social", "sm"]);

const NETWORK_TOKENS = [
  ["youtube", ["youtube", "yt"]],
  ["google", ["google", "adwords", "googleads", "gads"]],
  ["microsoft", ["bing", "microsoft", "msads"]],
  ["facebook", ["facebook", "fb", "meta"]],
  ["instagram", ["instagram", "ig"]],
  ["pinterest", ["pinterest", "pin"]],
  ["tiktok", ["tiktok"]],
  ["snapchat", ["snapchat", "snap"]],
  ["linkedin", ["linkedin"]],
  ["x", ["twitter", "x"]],
  ["reddit", ["reddit"]],
  ["threads", ["threads"]],
  ["yahoo", ["yahoo"]],
  ["duckduckgo", ["duckduckgo", "ddg"]],
  ["search", ["baidu", "yandex", "ecosia", "naver", "qwant", "startpage", "brave"]],
  ["awin", ["awin"]],
];
const SOCIAL_NETWORKS = new Set(["facebook", "instagram", "pinterest", "tiktok", "snapchat", "linkedin", "x", "reddit", "threads", "youtube"]);
const SEARCH_NETWORKS = new Set(["google", "microsoft", "yahoo", "duckduckgo", "search"]);
const PAID_BY_NETWORK = {
  google: "google_ads", youtube: "youtube_ads", microsoft: "microsoft_ads", facebook: "facebook_ads", instagram: "instagram_ads",
  pinterest: "pinterest_ads", tiktok: "tiktok_ads", snapchat: "snapchat_ads", linkedin: "linkedin_ads",
  x: "other_paid_social", reddit: "other_paid_social", threads: "other_paid_social",
  yahoo: "other_paid_search", duckduckgo: "other_paid_search", search: "other_paid_search",
};
const SOCIAL_BY_NETWORK = { facebook: "facebook_organic", instagram: "instagram_organic", pinterest: "pinterest_organic", tiktok: "tiktok_organic", youtube: "youtube_organic" };
const SEARCH_BY_NETWORK = { google: "google_organic", microsoft: "bing_organic", yahoo: "yahoo_organic", duckduckgo: "duckduckgo_organic" };

// Referrer hosts, checked in order. Mobile apps send android-app:// referrers whose "host" is the package name.
const REFERRER_RULES = [
  [/^(mail|webmail|outlook)\.|^outlook\.(live|office|office365)\.com$|^com\.google\.android\.gm$|^com\.microsoft\.office\.outlook$/, "other_email"],
  [/klclick|klaviyo/, "klaviyo_email"],
  [/(^|\.)youtube\.com$|^youtu\.be$|^com\.google\.android\.youtube$/, "youtube_organic"],
  [/(^|\.)google\.[a-z.]+$|^com\.google\.android\.googlequicksearchbox$/, "google_organic"],
  [/(^|\.)bing\.com$/, "bing_organic"],
  [/(^|\.)yahoo\.[a-z.]+$/, "yahoo_organic"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo_organic"],
  [/(^|\.)(baidu|yandex|ecosia|naver|qwant|startpage|seznam)\.[a-z.]+$|^search\.brave\.com$|^ask\.com$|^search\.aol\.com$/, "other_search"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$|^com\.facebook\.(katana|orca)$/, "facebook_organic"],
  [/(^|\.)instagram\.com$|^com\.instagram\.android$/, "instagram_organic"],
  [/(^|\.)pinterest\.[a-z.]+$|^pin\.it$/, "pinterest_organic"],
  [/(^|\.)tiktok\.com$/, "tiktok_organic"],
  [/^t\.co$|(^|\.)(twitter\.com|x\.com|linkedin\.com|reddit\.com|snapchat\.com|threads\.net|whatsapp\.com)$|^lnkd\.in$|^wa\.me$|^t\.me$/, "other_social"],
];

function toUrl(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return new URL(value.trim(), BASE);
  } catch {
    return null;
  }
}

function clean(value, max = 500) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

const lower = (value) => (value || "").toLowerCase();
const tokens = (value) => lower(value).split(/[^a-z0-9]+/).filter(Boolean);

function network(source) {
  const parts = tokens(source);
  for (const [name, words] of NETWORK_TOKENS) if (words.some((w) => parts.includes(w))) return name;
  return null;
}

function messagingPlatform(source, kx) {
  const s = lower(source);
  if (s.includes("klaviyo") || kx) return "klaviyo";
  if (s.includes("omnisend")) return "omnisend";
  if (s.includes("shopify")) return "shopify";
  return null;
}

function isInternal(host) {
  return INTERNAL_HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
}

// A visit as stored: the facts Shopify gave us, before any classification.
export function rawVisit(visit) {
  if (!visit) return null;
  const utm = {};
  for (const key of UTM_KEYS) {
    const value = clean(visit.utm?.[key]);
    if (value) utm[key] = value;
  }
  const landingPage = clean(visit.landingPage, 2000);
  const referrer = clean(visit.referrer, 2000);
  if (!landingPage && !referrer && !Object.keys(utm).length) return null;
  return { landingPage, referrer, utm };
}

// Reads tags and click IDs from one visit. Shopify's journey UTMs win; tags in the landing URL fill gaps.
export function parseTouch(visit, ownHosts = []) {
  const landing = toUrl(visit?.landingPage);
  const ref = toUrl(visit?.referrer);
  const params = landing?.searchParams;
  const param = (...names) => names.map((n) => clean(params?.get(n))).find(Boolean) ?? null;

  const touch = { landingPage: clean(visit?.landingPage, 2000), referrer: clean(visit?.referrer, 2000) };
  for (const key of UTM_KEYS) touch[`utm${key[0].toUpperCase()}${key.slice(1)}`] = clean(visit?.utm?.[key]) ?? param(`utm_${key}`);
  Object.assign(touch, {
    gclid: param("gclid"), gbraid: param("gbraid"), wbraid: param("wbraid"), msclkid: param("msclkid"), fbclid: param("fbclid"),
    ttclid: param("ttclid"), epik: param("epik"), liFatId: param("li_fat_id"), scCid: param("ScCid", "sccid"),
    kx: param("_kx"), awc: param("awc"),
  });
  const affiliate = AFFILIATE_PARAMS.find((p) => params?.get(p));
  touch.affiliateParam = affiliate || null;

  const landingHost = landing && landing.origin !== BASE ? landing.hostname.toLowerCase() : null;
  const own = [landingHost, ...ownHosts].filter(Boolean).map((h) => h.toLowerCase().replace(/^www\./, ""));
  const refHost = ref && ref.origin !== BASE ? ref.hostname.toLowerCase().replace(/^www\./, "") : null;
  touch.referrerHost = refHost && !own.includes(refHost) && !isInternal(refHost) ? refHost : null;
  return touch;
}

function ruleValue(touch, field) {
  if (field === "referrer") return touch.referrerHost || "";
  if (field === "landing_page") return touch.landingPage || "";
  const key = field.replace("utm_", "");
  return touch[`utm${key[0].toUpperCase()}${key.slice(1)}`] || "";
}

export function ruleMatches(rule, touch) {
  const actual = lower(ruleValue(touch, rule.field));
  const expected = lower(rule.value);
  if (!actual || !expected) return false;
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "starts_with") return actual.startsWith(expected);
  return actual.includes(expected);
}

function classifyTags(t) {
  const src = lower(t.utmSource);
  const med = lower(t.utmMedium);
  const net = network(src);
  const platform = messagingPlatform(src, t.kx);

  if (SMS_MEDIUMS.has(med)) return platform === "klaviyo" ? "klaviyo_sms" : platform === "omnisend" ? "omnisend_sms" : "other_sms";
  // A bare "shopify" source is too vague to call email; Klaviyo and Omnisend sources are not.
  if (EMAIL_MEDIUMS.has(med) || (platform && platform !== "shopify" && !med) || src.includes("mailchimp")) {
    return { klaviyo: "klaviyo_email", omnisend: "omnisend_email", shopify: "shopify_email" }[platform] || "other_email";
  }
  if (QR_VALUES.has(med) || QR_VALUES.has(src)) return "qr_code";
  if (AFFILIATE_MEDIUMS.has(med) || net === "awin") {
    if (net === "awin") return "awin";
    return /influenc|creator/.test(`${src} ${lower(t.utmCampaign)}`) ? "influencer_affiliate" : "other_affiliate";
  }
  if (INFLUENCER_MEDIUMS.has(med)) return "influencer";
  if (OFFLINE_MEDIUMS.has(med)) return "offline";
  if (PAID_MEDIUMS.has(med)) {
    if (PAID_BY_NETWORK[net]) return PAID_BY_NETWORK[net];
    if (PAID_SOCIAL_MEDIUMS.has(med)) return "other_paid_social";
    if (PAID_SEARCH_MEDIUMS.has(med)) return "other_paid_search";
    return "campaign";
  }
  if (SOCIAL_MEDIUMS.has(med) || (!med && SOCIAL_NETWORKS.has(net))) return SOCIAL_BY_NETWORK[net] || "other_social";
  if (med === "organic" || med === "seo" || (!med && SEARCH_NETWORKS.has(net))) return SEARCH_BY_NETWORK[net] || "other_search";
  if (med === "referral") return "referral";
  return "campaign";
}

function tagSummary(t) {
  return [["utm_source", t.utmSource], ["utm_medium", t.utmMedium], ["utm_campaign", t.utmCampaign]]
    .filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || `utm_id=${t.utmId}`;
}

const result = (channel, confidence, evidence) => ({ channel, confidence, evidence });

// One visit → channel, how sure we are, and the evidence in plain words.
export function classifyTouch(t, rules = []) {
  const rule = rules.find((r) => r.enabled !== false && ruleMatches(r, t));
  if (rule) return result(rule.channel, "high", `Matched your rule "${rule.name}"`);

  const googleId = t.gclid ? "gclid" : t.gbraid ? "gbraid" : t.wbraid ? "wbraid" : null;
  if (googleId) return result(network(t.utmSource) === "youtube" ? "youtube_ads" : "google_ads", "high", `Google Ads click ID (${googleId}) on the landing page`);
  if (t.msclkid) return result("microsoft_ads", "high", "Microsoft Ads click ID (msclkid) on the landing page");
  if (t.ttclid) return result("tiktok_ads", "high", "TikTok click ID (ttclid) on the landing page");
  if (t.scCid) return result("snapchat_ads", "high", "Snapchat click ID (ScCid) on the landing page");
  if (t.epik) return result("pinterest_ads", "high", "Pinterest click ID (epik) on the landing page");
  if (t.liFatId) return result("linkedin_ads", "high", "LinkedIn click ID (li_fat_id) on the landing page");
  if (t.awc) return result("awin", "high", "AWIN click ID (awc) on the landing page");
  if (t.affiliateParam) return result("other_affiliate", "high", `Affiliate click ID (${t.affiliateParam}) on the landing page`);
  if (t.utmSource || t.utmMedium || t.utmCampaign || t.utmId) return result(classifyTags(t), "high", `Campaign tags: ${tagSummary(t)}`);
  if (t.kx) return result("klaviyo_email", "high", "Klaviyo tracking parameter (_kx) on the landing page");
  if (t.referrerHost) {
    const match = REFERRER_RULES.find(([pattern]) => pattern.test(t.referrerHost));
    return result(match ? match[1] : "referral", "medium", `Came from ${t.referrerHost}`);
  }
  if (t.fbclid) return result("facebook_organic", "medium", "Facebook click ID (fbclid) without ad campaign tags");
  if (t.landingPage) return result("direct", "low", "No referring website or campaign tags");
  return result("unknown", "none", "No visit information");
}

function nonWebChannel(sourceName) {
  const name = lower(sourceName);
  if (name === "pos") return "pos";
  if (name === "shopify_draft_order") return "draft_order";
  return null;
}

// The full attribution for one order, computed from its stored raw visits.
export function computeAttribution(raw, { rules = [], model = DEFAULT_MODEL } = {}) {
  const hosts = raw.hosts || [];
  const first = raw.first ? parseTouch(raw.first, hosts) : null;
  const last = raw.last ? parseTouch(raw.last, hosts) : null;
  const firstC = first && classifyTouch(first, rules);
  const lastC = last && classifyTouch(last, rules);
  const strong = (x) => x && !["direct", "unknown"].includes(x.channel);
  const pickC = strong(lastC) ? lastC : strong(firstC) ? firstC : lastC || firstC;
  const pickTouch = pickC === lastC ? last : pickC === firstC ? first : null;

  const nonWeb = nonWebChannel(raw.sourceName);
  let channels;
  let status;
  if (nonWeb) {
    channels = { first_touch: nonWeb, last_touch: nonWeb, last_non_direct: nonWeb };
    status = result(nonWeb, "high", `Shopify order source: ${CHANNELS[nonWeb].label}`);
  } else {
    channels = {
      first_touch: firstC?.channel ?? lastC?.channel ?? "unknown",
      last_touch: lastC?.channel ?? firstC?.channel ?? "unknown",
      last_non_direct: pickC?.channel ?? "unknown",
    };
    status = pickC && pickC.channel !== "unknown" ? pickC
      : raw.ready === false ? result("unknown", "none", "Shopify hasn't finished processing this order's visits")
      : result("unknown", "none", raw.sourceName && lower(raw.sourceName) !== "web" ? `Placed through "${raw.sourceName}"; no store visit recorded` : "Shopify has no visit data for this order");
  }

  const attributionStatus = nonWeb ? "attributed"
    : !pickC || pickC.channel === "unknown" ? (raw.ready === false ? "pending_enrichment" : "unknown")
    : { high: "attributed", medium: "partially_attributed", low: "unattributed" }[pickC.confidence];
  // A click ID from any visit stays usable for ad platforms, even if another visit got the credit.
  const id = (key) => pickTouch?.[key] ?? last?.[key] ?? first?.[key] ?? null;

  return {
    channel: channels[MODELS[model] ? model : DEFAULT_MODEL],
    firstChannel: channels.first_touch,
    lastChannel: channels.last_touch,
    lastNonDirectChannel: channels.last_non_direct,
    attributionStatus,
    attributionConfidence: status.confidence,
    attributionEvidence: status.evidence,
    utmSource: pickTouch?.utmSource ?? null,
    utmMedium: pickTouch?.utmMedium ?? null,
    utmCampaign: pickTouch?.utmCampaign ?? null,
    utmTerm: pickTouch?.utmTerm ?? null,
    utmContent: pickTouch?.utmContent ?? null,
    utmId: pickTouch?.utmId ?? null,
    gclid: id("gclid"),
    gbraid: id("gbraid"),
    wbraid: id("wbraid"),
    msclkid: id("msclkid"),
    fbclid: id("fbclid"),
    ttclid: id("ttclid"),
    epik: id("epik"),
    liFatId: id("liFatId"),
    scCid: id("scCid"),
    landingSite: pickTouch?.landingPage ?? null,
    referringSite: pickTouch?.referrer ?? null,
    sourceName: clean(raw.sourceName, 100),
    attribution: JSON.stringify(raw),
  };
}

export function attributeOrder({ sourceName, firstVisit, lastVisit, ready = null, ownHosts = [], rules = [], model = DEFAULT_MODEL }) {
  const raw = { v: 2, first: rawVisit(firstVisit), last: rawVisit(lastVisit), sourceName: clean(sourceName, 100), ready, hosts: ownHosts.filter(Boolean) };
  return computeAttribution(raw, { rules, model });
}

// Order webhook (REST-shaped) payload. Shopify only sends the session that placed the order.
export function attributionFromWebhook(order, shop, config = {}) {
  const visit = order.landing_site || order.referring_site ? { landingPage: order.landing_site, referrer: order.referring_site } : null;
  return attributeOrder({ sourceName: order.source_name, lastVisit: visit, ownHosts: [shop], ...config });
}

const journeyVisit = (visit) => visit && { landingPage: visit.landingPage, referrer: visit.referrerUrl, utm: visit.utmParameters || undefined };

// Admin GraphQL order with customerJourneySummary.
export function attributionFromGraphql(order, ownHosts = [], config = {}) {
  const journey = order.customerJourneySummary;
  return attributeOrder({
    sourceName: order.sourceName,
    firstVisit: journeyVisit(journey?.firstVisit),
    lastVisit: journeyVisit(journey?.lastVisit),
    ready: journey ? journey.ready !== false : null,
    ownHosts,
    ...config,
  });
}

// Stored JSON → raw visits. The first release stored parsed visits; they still hold every raw fact.
export function storedRaw(row, shop) {
  let data = null;
  try {
    data = row.attribution ? JSON.parse(row.attribution) : null;
  } catch {
    data = null;
  }
  if (data?.v === 2) return data;
  const fromParsed = (t) => t && rawVisit({ landingPage: t.landingPage, referrer: t.referrer, utm: { source: t.utmSource, medium: t.utmMedium, campaign: t.utmCampaign, term: t.utmTerm, content: t.utmContent } });
  return { v: 2, first: fromParsed(data?.first), last: fromParsed(data?.last), sourceName: row.sourceName ?? null, ready: null, hosts: [shop] };
}

// ---------- Settings and rules ----------

export async function getAttributionSettings(shop, db = prisma) {
  const settings = await db.attributionSettings.findUnique({ where: { shop } });
  return { defaultModel: MODELS[settings?.defaultModel] ? settings.defaultModel : DEFAULT_MODEL };
}

export async function listChannelRules(shop, db = prisma) {
  return db.channelRule.findMany({ where: { shop }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

export async function loadAttributionConfig(shop, db = prisma) {
  const [{ defaultModel }, rules] = await Promise.all([getAttributionSettings(shop, db), listChannelRules(shop, db)]);
  return { model: defaultModel, rules: rules.filter((r) => r.enabled) };
}

export async function setDefaultModel(shop, model, db = prisma) {
  if (!MODELS[model]) return { error: "Choose one of the listed models." };
  await db.attributionSettings.upsert({ where: { shop }, create: { shop, defaultModel: model }, update: { defaultModel: model } });
  // The column name comes from a fixed list, never from the request.
  await db.$executeRawUnsafe(`UPDATE "ShopifyOrder" SET "channel" = "${MODEL_COLUMNS[model]}" WHERE "shop" = $1`, shop);
  return { message: `Orders are now credited using ${MODELS[model].label.toLowerCase()}.` };
}

const MAX_RULES = 50;

export function validateRule(input) {
  const field = String(input.field || "");
  const operator = String(input.operator || "");
  const value = String(input.value || "").trim();
  const channel = String(input.channel || "");
  if (!RULE_FIELDS[field]) return { error: "Choose what the rule should look at." };
  if (!RULE_OPERATORS[operator]) return { error: "Choose how the value should match." };
  if (!value || value.length > 200) return { error: "Enter a value to match, up to 200 characters." };
  if (!CHANNELS[channel] || channel === "unknown") return { error: "Choose the channel these orders should be credited to." };
  const name = String(input.name || "").trim().slice(0, 80) || `${RULE_FIELDS[field]} ${RULE_OPERATORS[operator]} "${value}"`;
  return { rule: { field, operator, value, channel, name } };
}

export async function createChannelRule(shop, input, db = prisma) {
  const { rule, error } = validateRule(input);
  if (error) return { error };
  const count = await db.channelRule.count({ where: { shop } });
  if (count >= MAX_RULES) return { error: `You can have up to ${MAX_RULES} rules. Delete one to add another.` };
  await db.channelRule.create({ data: { shop, ...rule, position: count } });
  const updated = await reapplyAttribution(shop, db);
  return { message: `Rule added. ${updated} order${updated === 1 ? "" : "s"} rechecked.` };
}

export async function updateChannelRule(shop, id, action, db = prisma) {
  const rule = await db.channelRule.findFirst({ where: { id: String(id || ""), shop } });
  if (!rule) return { error: "That rule no longer exists. Reload the page." };
  if (action === "delete") await db.channelRule.delete({ where: { id: rule.id } });
  else if (action === "toggle") await db.channelRule.update({ where: { id: rule.id }, data: { enabled: !rule.enabled } });
  else if (action === "up" || action === "down") {
    const rules = await listChannelRules(shop, db);
    const index = rules.findIndex((r) => r.id === rule.id);
    const swap = rules[index + (action === "up" ? -1 : 1)];
    if (!swap) return { message: "The rule is already at that end of the list." };
    const order = rules.map((r) => r.id);
    [order[index], order[order.indexOf(swap.id)]] = [swap.id, rule.id];
    await db.$transaction(order.map((ruleId, position) => db.channelRule.update({ where: { id: ruleId }, data: { position } })));
  } else return { error: "Unknown action." };
  const updated = await reapplyAttribution(shop, db);
  const verb = { delete: "deleted", toggle: rule.enabled ? "turned off" : "turned on", up: "moved up", down: "moved down" }[action];
  return { message: `Rule ${verb}. ${updated} order${updated === 1 ? "" : "s"} rechecked.` };
}

// Recomputes every stored order from its raw visits with the current rules and model. No Shopify calls.
export async function reapplyAttribution(shop, db = prisma, batch = 500) {
  const config = await loadAttributionConfig(shop, db);
  let cursor = null;
  let count = 0;
  for (;;) {
    const rows = await db.shopifyOrder.findMany({
      where: { shop },
      select: { id: true, attribution: true, sourceName: true },
      orderBy: { id: "asc" },
      take: batch,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    await db.$transaction(rows.map((row) => db.shopifyOrder.update({ where: { id: row.id }, data: computeAttribution(storedRaw(row, shop), config) })));
    count += rows.length;
    cursor = rows[rows.length - 1].id;
    if (rows.length < batch) break;
  }
  return count;
}

// ---------- Shopify sync ----------

const VISIT_FIELDS = `landingPage referrerUrl utmParameters { source medium campaign term content }`;
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
  const config = await loadAttributionConfig(shop, db);
  let after = null;
  let synced = 0;
  const pending = [];

  while (synced < limit) {
    const data = await graphql(admin, ORDERS_ATTRIBUTION_QUERY, { first: Math.min(50, limit - synced), after });
    const ownHosts = [shop, data.shop?.primaryDomain?.host].filter(Boolean);

    for (const order of data.orders.nodes) {
      const orderId = order.id.split("/").pop();
      const fields = attributionFromGraphql(order, ownHosts, config);
      if (fields.attributionStatus === "pending_enrichment") pending.push(order.name);
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

// ---------- Reports ----------

const PAID_GROUPS = new Set(["paid_search", "paid_social"]);

export function resolveModel(requested, fallback) {
  return MODELS[requested] ? requested : fallback;
}

// Everything the Order sources page shows, computed in the database.
export async function getAttributionReport(shop, { model: requested, group, channel, status, take = 50 } = {}, db = prisma) {
  const { defaultModel } = await getAttributionSettings(shop, db);
  const model = resolveModel(requested, defaultModel);
  const column = MODEL_COLUMNS[model];
  const where = { shop };

  const [byChannel, byStatus, needsUpdate, campaignRows] = await Promise.all([
    db.shopifyOrder.groupBy({ by: [column], where, _count: { _all: true }, _sum: { totalPrice: true } }),
    db.shopifyOrder.groupBy({ by: ["attributionStatus"], where, _count: { _all: true } }),
    db.shopifyOrder.count({ where: { shop, attributionStatus: null } }),
    db.shopifyOrder.groupBy({ by: ["lastNonDirectChannel", "utmSource", "utmCampaign"], where: { shop, utmCampaign: { not: null } }, _count: { _all: true }, _sum: { totalPrice: true } }),
  ]);

  const totalOrders = byChannel.reduce((n, r) => n + r._count._all, 0);
  const totalRevenue = byChannel.reduce((n, r) => n + (r._sum.totalPrice || 0), 0);

  const groups = new Map();
  for (const row of byChannel) {
    const info = channelInfo(row[column] || "unknown");
    const entry = groups.get(info.group) || { key: info.group, ...CHANNEL_GROUPS[info.group], orders: 0, revenue: 0, channels: [] };
    const existing = entry.channels.find((ch) => ch.key === info.key);
    const orders = row._count._all;
    const revenue = row._sum.totalPrice || 0;
    if (existing) {
      existing.orders += orders;
      existing.revenue += revenue;
    } else entry.channels.push({ key: info.key, label: info.label, orders, revenue });
    entry.orders += orders;
    entry.revenue += revenue;
    groups.set(info.group, entry);
  }
  const groupList = [...groups.values()]
    .map((g) => ({ ...g, share: totalOrders ? g.orders / totalOrders : 0, channels: g.channels.sort((a, b) => b.orders - a.orders).map((ch) => ({ ...ch, share: totalOrders ? ch.orders / totalOrders : 0 })) }))
    .sort((a, b) => (a.key === "direct") - (b.key === "direct") || b.orders - a.orders);

  const quality = Object.keys(STATUSES).map((key) => ({
    key,
    ...STATUSES[key],
    orders: byStatus.find((r) => r.attributionStatus === key)?._count._all || 0,
  }));
  const identified = quality.filter((q) => q.key === "attributed" || q.key === "partially_attributed").reduce((n, q) => n + q.orders, 0);
  const topChannel = groupList.flatMap((g) => g.channels).filter((ch) => !["direct", "unknown"].includes(ch.key)).sort((a, b) => b.orders - a.orders)[0] || null;
  const paidRevenue = groupList.filter((g) => PAID_GROUPS.has(g.key)).reduce((n, g) => n + g.revenue, 0);

  const campaigns = campaignRows
    .map((r) => ({ channel: channelInfo(r.lastNonDirectChannel).label, source: r.utmSource, campaign: r.utmCampaign, orders: r._count._all, revenue: r._sum.totalPrice || 0 }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  // One row per source, busiest first; direct and unknown always last.
  const rows = groupList
    .flatMap((g) => g.channels.map((ch) => ({ ...ch, group: g.key, groupLabel: g.label, tone: g.tone, average: ch.orders ? ch.revenue / ch.orders : 0 })))
    .sort((a, b) => (a.group === "direct") - (b.group === "direct") || b.orders - a.orders || b.revenue - a.revenue);

  const channelFilter = channel && CHANNELS[channel] ? channel : null;
  const groupChannels = !channelFilter && group && CHANNEL_GROUPS[group] ? Object.keys(CHANNELS).filter((k) => CHANNELS[k].group === group) : null;
  const orderWhere = {
    shop,
    ...(channelFilter ? { [column]: channelFilter } : {}),
    ...(groupChannels ? { [column]: { in: groupChannels } } : {}),
    ...(status && STATUSES[status] ? { attributionStatus: status } : {}),
  };
  const orders = await db.shopifyOrder.findMany({
    where: orderWhere,
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, orderId: true, orderNumber: true, createdAt: true, totalPrice: true, currency: true,
      channel: true, firstChannel: true, lastChannel: true, lastNonDirectChannel: true,
      attributionStatus: true, attributionConfidence: true, attributionEvidence: true,
      utmSource: true, utmMedium: true, utmCampaign: true, referringSite: true,
    },
  });

  return {
    model,
    defaultModel,
    filters: { group: groupChannels ? group : null, channel: channelFilter, status: status && STATUSES[status] ? status : null },
    totals: {
      orders: totalOrders,
      revenue: totalRevenue,
      identifiedShare: totalOrders ? identified / totalOrders : 0,
      topChannel,
      paidRevenue,
      paidShare: totalRevenue ? paidRevenue / totalRevenue : 0,
    },
    groups: groupList,
    rows,
    quality,
    needsUpdate,
    campaigns,
    orders: orders.map((o) => ({ ...o, credited: o[column] || o.channel || "unknown" })),
    currency: orders[0]?.currency || "USD",
  };
}

// Compact list for the tracking dashboard.
export async function getChannelBreakdown(shop, db = prisma) {
  const { defaultModel } = await getAttributionSettings(shop, db);
  const column = MODEL_COLUMNS[defaultModel];
  const rows = await db.shopifyOrder.groupBy({ by: [column], where: { shop }, _count: { _all: true }, _sum: { totalPrice: true } });
  const total = rows.reduce((n, r) => n + r._count._all, 0);
  const merged = new Map();
  for (const r of rows) {
    const info = channelInfo(r[column] || "unknown");
    const entry = merged.get(info.key) || { channel: info.key, label: info.label, group: info.groupLabel, orders: 0, revenue: 0 };
    entry.orders += r._count._all;
    entry.revenue += r._sum.totalPrice || 0;
    merged.set(info.key, entry);
  }
  return [...merged.values()].map((r) => ({ ...r, share: total ? r.orders / total : 0 })).sort((a, b) => b.orders - a.orders);
}
