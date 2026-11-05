import { createSign } from "node:crypto";
import { graphql } from "./shopify-api.server.js";

export function googleConfiguration() {
  return { pageSpeed: Boolean(process.env.PAGESPEED_API_KEY), searchConsole: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) };
}

export async function searchConsoleToken(write = false, request = fetch) {
  let account;
  try { account = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}"); } catch { throw new Error("Google service account configuration is invalid."); }
  if (!account.client_email || !account.private_key) throw new Error("Configure GOOGLE_SERVICE_ACCOUNT_JSON and grant its email access to the store's Search Console property.");
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email,
    scope: `https://www.googleapis.com/auth/webmasters${write ? "" : ".readonly"}`, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signer = createSign("RSA-SHA256"); signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(account.private_key, "base64url")}`;
  const response = await request("https://oauth2.googleapis.com/token", { method: "POST", signal: AbortSignal.timeout(20000), body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error(`Google authorization failed (${response.status}). Check the configured service account.`);
  const body = await response.json();
  if (!body.access_token) throw new Error("Google did not return an access token.");
  return body.access_token;
}

export async function googleProperty(admin) {
  const data = await graphql(admin, `query VeyroGoogleProperty { shop { primaryDomain { url } } }`);
  return `${new URL(data.shop.primaryDomain.url).origin}/`;
}

export function performanceSummary(body) {
  const lighthouse = body.lighthouseResult;
  if (!lighthouse || lighthouse.runtimeError) throw new Error("Google could not complete the performance measurement. Check that the storefront is public.");
  const audits = lighthouse.audits || {};
  return { url: lighthouse.finalDisplayedUrl || lighthouse.finalUrl, measuredAt: lighthouse.fetchTime,
    score: typeof lighthouse.categories?.performance?.score === "number" ? Math.round(lighthouse.categories.performance.score * 100) : null,
    lcpMs: audits["largest-contentful-paint"]?.numericValue ?? null, cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    totalBlockingTimeMs: audits["total-blocking-time"]?.numericValue ?? null,
    opportunities: Object.values(audits).filter((audit) => audit.details?.overallSavingsMs > 0).map((audit) => ({ title: audit.title, savingsMs: audit.details.overallSavingsMs })).slice(0, 10) };
}

export async function processGoogle({ job, admin, db, assertActive, request = fetch, token = searchConsoleToken }) {
  const kind = job.kind;
  try {
    await assertActive();
    const property = await googleProperty(admin);
    let report;
    if (kind === "performance") {
      if (!process.env.PAGESPEED_API_KEY) throw new Error("Configure PAGESPEED_API_KEY on the worker to run performance measurements.");
      const url = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
      url.search = new URLSearchParams({ url: property, key: process.env.PAGESPEED_API_KEY, category: "PERFORMANCE", strategy: "mobile" }).toString();
      const response = await request(url, { signal: AbortSignal.timeout(90000) });
      if (!response.ok) throw new Error(`PageSpeed measurement failed (${response.status}). Check the API key, quota, and storefront access.`);
      report = performanceSummary(await response.json());
    } else {
      const submit = kind === "sitemapSubmit";
      const accessToken = await token(submit);
      const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}`;
      if (submit) {
        const sitemap = `${property}sitemap.xml`;
        await assertActive();
        const response = await request(`${base}/sitemaps/${encodeURIComponent(sitemap)}`, { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Sitemap submission failed (${response.status}). Grant the service account access to the URL-prefix property ${property}`);
        report = { property, sitemap, submittedAt: new Date().toISOString() };
      } else {
        const end = new Date(); end.setUTCDate(end.getUTCDate() - 3);
        const start = new Date(end); start.setUTCDate(start.getUTCDate() - 27);
        const dates = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
        const response = await request(`${base}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...dates, dimensions: ["date"], rowLimit: 28 }), signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error(`Search Console sync failed (${response.status}). Grant the service account access to the URL-prefix property ${property}`);
        const body = await response.json();
        const rows = body.rows || [];
        const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
        const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
        report = { property, ...dates, rows, clicks, impressions, ctr: impressions ? clicks / impressions : 0 };
      }
    }
    await assertActive();
    await db.integrationReport.upsert({ where: { shop_kind: { shop: job.shop, kind } }, create: { shop: job.shop, kind, report: JSON.stringify(report) }, update: { report: JSON.stringify(report), error: null } });
  } catch (error) {
    await db.integrationReport.upsert({ where: { shop_kind: { shop: job.shop, kind } }, create: { shop: job.shop, kind, error: error.message }, update: { error: error.message } });
    throw error;
  }
}
