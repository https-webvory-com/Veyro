// Shared by server and browser code. Every channel an order can be credited to,
// grouped the way merchants think about marketing.

export const CHANNEL_GROUPS = {
  paid_search: { label: "Paid search", description: "Search ads such as Google Ads and Microsoft Ads", tone: "info" },
  paid_social: { label: "Paid social", description: "Ads on Facebook, Instagram, TikTok, Pinterest, and other social apps", tone: "info" },
  organic_search: { label: "Organic search", description: "Unpaid results on Google, Bing, and other search engines", tone: "success" },
  organic_social: { label: "Organic social", description: "Unpaid posts, profiles, and shares on social apps", tone: "success" },
  email: { label: "Email", description: "Email campaigns and flows", tone: "success" },
  sms: { label: "SMS", description: "Text message campaigns and flows", tone: "success" },
  affiliate: { label: "Affiliate", description: "Affiliate networks and partner links", tone: "warning" },
  other: { label: "Other", description: "Referral sites, influencers, QR codes, and offline campaigns", tone: "neutral" },
  direct: { label: "Direct & unknown", description: "Typed URLs, bookmarks, and orders with no source information", tone: "neutral" },
};

const c = (label, group) => ({ label, group });

export const CHANNELS = {
  // Paid search
  google_ads: c("Google Ads", "paid_search"),
  microsoft_ads: c("Microsoft Ads", "paid_search"),
  other_paid_search: c("Other paid search", "paid_search"),
  // Paid social
  facebook_ads: c("Facebook Ads", "paid_social"),
  instagram_ads: c("Instagram Ads", "paid_social"),
  pinterest_ads: c("Pinterest Ads", "paid_social"),
  tiktok_ads: c("TikTok Ads", "paid_social"),
  snapchat_ads: c("Snapchat Ads", "paid_social"),
  youtube_ads: c("YouTube Ads", "paid_social"),
  linkedin_ads: c("LinkedIn Ads", "paid_social"),
  other_paid_social: c("Other paid social", "paid_social"),
  // Organic search
  google_organic: c("Google", "organic_search"),
  bing_organic: c("Bing", "organic_search"),
  yahoo_organic: c("Yahoo", "organic_search"),
  duckduckgo_organic: c("DuckDuckGo", "organic_search"),
  other_search: c("Other search engines", "organic_search"),
  // Organic social
  facebook_organic: c("Facebook", "organic_social"),
  instagram_organic: c("Instagram", "organic_social"),
  pinterest_organic: c("Pinterest", "organic_social"),
  tiktok_organic: c("TikTok", "organic_social"),
  youtube_organic: c("YouTube", "organic_social"),
  other_social: c("Other social", "organic_social"),
  // Email
  klaviyo_email: c("Klaviyo email", "email"),
  shopify_email: c("Shopify Email", "email"),
  omnisend_email: c("Omnisend email", "email"),
  other_email: c("Other email", "email"),
  // SMS
  klaviyo_sms: c("Klaviyo SMS", "sms"),
  omnisend_sms: c("Omnisend SMS", "sms"),
  other_sms: c("Other SMS", "sms"),
  // Affiliate
  awin: c("AWIN", "affiliate"),
  other_affiliate: c("Other affiliate", "affiliate"),
  influencer_affiliate: c("Influencer affiliate link", "affiliate"),
  // Other
  referral: c("Referral site", "other"),
  influencer: c("Influencer", "other"),
  qr_code: c("QR code", "other"),
  offline: c("Offline campaign", "other"),
  pos: c("Point of sale", "other"),
  draft_order: c("Draft order", "other"),
  campaign: c("Other tagged campaign", "other"),
  // Direct and unknown
  direct: c("Direct", "direct"),
  unknown: c("Unknown", "direct"),
};

// Channel keys stored by the first release, before the full channel list existed.
const LEGACY = {
  organic_search: "other_search",
  paid_social: "other_paid_social",
  social: "other_social",
  email: "other_email",
  other: "unknown",
};

export function channelInfo(key) {
  const channel = CHANNELS[key] || CHANNELS[LEGACY[key]] || CHANNELS.unknown;
  return { key: CHANNELS[key] ? key : LEGACY[key] || "unknown", ...channel, groupLabel: CHANNEL_GROUPS[channel.group].label, tone: CHANNEL_GROUPS[channel.group].tone };
}

export const MODELS = {
  last_non_direct: {
    label: "Last non-direct click",
    short: "Last non-direct",
    description: "Credits the most recent visit that came from a real source. A later direct visit (typed URL, bookmark) doesn't take the credit. Recommended for most stores.",
  },
  last_touch: {
    label: "Last click",
    short: "Last click",
    description: "Credits the visit that placed the order, even if it was direct.",
  },
  first_touch: {
    label: "First click",
    short: "First click",
    description: "Credits the visit that first brought the customer to your store. Useful for seeing which channels find new customers.",
  },
};
export const DEFAULT_MODEL = "last_non_direct";

export const STATUSES = {
  attributed: { label: "Source found", tone: "success", description: "An ad click ID, campaign tags, or your rule shows the source." },
  partially_attributed: { label: "Partly known", tone: "info", description: "The referring website is known, but not the campaign." },
  unattributed: { label: "No source info", tone: "neutral", description: "Arrived directly: typed URL, bookmark, or a private app." },
  pending_enrichment: { label: "Waiting for Shopify", tone: "caution", description: "Shopify is still processing the visit. Sync again shortly." },
  unknown: { label: "No visit data", tone: "warning", description: "No store visit recorded, such as orders created in the admin." },
};

export const CONFIDENCE = {
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export const RULE_FIELDS = {
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_campaign: "UTM campaign",
  utm_content: "UTM content",
  utm_term: "UTM term",
  referrer: "Referring website",
  landing_page: "Landing page URL",
};

export const RULE_OPERATORS = {
  equals: "is",
  contains: "contains",
  starts_with: "starts with",
};
