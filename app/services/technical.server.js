import { load } from "cheerio";
import prisma from "../db.server.js";
import { graphql, checkUserErrors } from "./shopify-api.server.js";
import { enqueue } from "./queue.server.js";
import { publicGet } from "./public-fetch.server.js";
import { googleConfiguration } from "./google.server.js";

export function relativePath(value) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s\p{Cc}]/u.test(path) || path.length > 1000) throw new Error("Enter a store-relative path beginning with one slash.");
  let decoded;
  try { decoded = decodeURIComponent(path); } catch { throw new Error("Invalid path encoding."); }
  if (/^\/\//.test(decoded) || /[\\\p{Cc}]/u.test(decoded)) throw new Error("Invalid path.");
  if (/^\/(admin|account|cart|checkout|checkouts|apps)(\/|\?|$)/i.test(new URL(decoded, "https://store.invalid").pathname)) throw new Error("Use a public storefront content path, not an account, cart, app, or checkout URL.");
  return path;
}

async function storeOrigin(admin) {
  const data = await graphql(admin, `query VeyroStoreDomain { shop { primaryDomain { url } } }`);
  return new URL(data.shop.primaryDomain.url).origin;
}

export function inspectHtml(html, url) {
  const $ = load(html);
  const schemas = [];
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value["@type"]) schemas.push(...[].concat(value["@type"]));
    if (Array.isArray(value)) value.forEach(walk); else Object.values(value).forEach(walk);
  }
  $("script[type='application/ld+json']").each((_index, element) => { try { walk(JSON.parse($(element).text())); } catch { /* Invalid schema does not count as present. */ } });
  const links = new Set();
  $("a[href]").each((_index, element) => {
    try {
      const target = new URL($(element).attr("href"), url); target.hash = "";
      if (target.origin === new URL(url).origin && !target.search) { relativePath(target.pathname); links.add(target.href); }
    } catch { /* Ignore non-public and non-HTTP links. */ }
  });
  return { title: $("title").first().text().trim(), description: $("meta[name='description']").attr("content") || "", h1Count: $("h1").length,
    canonical: $("link[rel='canonical']").attr("href") || "", hasProductSchema: schemas.includes("Product") || schemas.includes("ProductGroup"), hasOrganizationSchema: schemas.includes("Organization"),
    robotsNoindex: /noindex/i.test($("meta[name='robots']").attr("content") || ""), linkUrls: [...links] };
}

export async function loadTechnical({ admin, shop, db = prisma }) {
  const result = { scans: [], redirects: [], storeUrl: "", googleConfigured: googleConfiguration(), integrations: [] };
  try {
    const integrations = await db.integrationReport.findMany({ where: { shop } });
    result.integrations = integrations.map((row) => ({ ...row, report: row.report ? JSON.parse(row.report) : null }));
    const scans = await db.siteScan.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 10 });
    result.scans = scans.map((scan) => ({ ...scan, report: scan.report ? JSON.parse(scan.report) : null }));
    result.storeUrl = await storeOrigin(admin);
    const data = await graphql(admin, `query VeyroRedirects { urlRedirects(first: 50) { nodes { id path target } } }`);
    result.redirects = data.urlRedirects.nodes;
  } catch (error) { result.error = error.message; }
  return result;
}

export async function handleTechnical({ admin, shop, formData, db = prisma, get = publicGet }) {
  try {
    const origin = await storeOrigin(admin);
    if (["performance", "searchConsole", "sitemapSubmit"].includes(formData.get("intent"))) {
      const kind = String(formData.get("intent"));
      const configured = googleConfiguration();
      if (!(kind === "performance" ? configured.pageSpeed : configured.searchConsole)) throw new Error("Configure the corresponding Google credentials on the app and worker before using this integration.");
      await enqueue({ shop, kind }, db);
      return { message: "Google integration job queued. Refresh after the worker finishes." };
    }
    if (formData.get("intent") === "scan") {
      const path = relativePath(formData.get("path") || "/");
      const scan = await db.siteScan.create({ data: { shop, url: new URL(path, origin).href } });
      try { await enqueue({ shop, kind: "scan", payload: { scanId: scan.id } }, db); }
      catch (error) { await db.siteScan.update({ where: { id: scan.id }, data: { status: "failed", error: error.message } }); throw error; }
      return { message: "Storefront scan queued. Refresh after the worker finishes." };
    }
    if (formData.get("intent") !== "redirect") throw new Error("Unknown technical SEO action.");
    const path = relativePath(formData.get("path")); const target = relativePath(formData.get("target"));
    if (path === target || new URL(path, origin).href === new URL(target, origin).href) throw new Error("Redirect source and destination must differ.");
    // Verify source is broken and destination resolves now; this also rejects immediate loops.
    const sourceResponse = await get(new URL(path, origin).href, { origin });
    if (![404, 410].includes(sourceResponse.status)) throw new Error("The source must currently return 404 or 410 before creating a redirect.");
    const targetResponse = await get(new URL(target, origin).href, { origin });
    if (targetResponse.status < 200 || targetResponse.status >= 300) throw new Error("The redirect destination must resolve successfully.");
    const data = await graphql(admin, `mutation VeyroCreateRedirect($redirect: UrlRedirectInput!) { urlRedirectCreate(urlRedirect: $redirect) { urlRedirect { id path target } userErrors { field message } } }`, { redirect: { path, target } });
    const result = checkUserErrors(data.urlRedirectCreate);
    if (!result.urlRedirect?.id) throw new Error("Shopify did not confirm the redirect.");
    return { message: "Redirect created in Shopify." };
  } catch (error) { return { error: error.message }; }
}

export async function processScan({ job, payload, admin, db, assertActive, get = publicGet }) {
  const scan = await db.siteScan.findFirst({ where: { id: payload.scanId, shop: job.shop } });
  if (!scan || scan.status === "completed") return;
  try {
    const origin = await storeOrigin(admin);
    if (new URL(scan.url).origin !== origin) throw new Error("Store domain changed. Queue a new scan.");
    await assertActive();
    const response = await get(scan.url, { origin });
    if (!String(response.headers["content-type"]).includes("text/html")) throw new Error("The scan target did not return HTML.");
    const { linkUrls, ...details } = inspectHtml(response.body.toString("utf8"), response.url);
    const links = [];
    for (const url of linkUrls.slice(0, 20)) {
      await assertActive();
      try { const found = await get(url, { origin }); links.push({ url, status: found.status, error: null }); }
      catch (error) { links.push({ url, status: null, error: error.message }); }
    }
    const report = { ...details, robotsNoindex: details.robotsNoindex || /noindex/i.test(String(response.headers["x-robots-tag"] || "")), statusCode: response.status,
      links, brokenCount: links.filter((link) => [404, 410].includes(link.status)).length, checkedLinks: links.length, totalLinks: linkUrls.length,
      responseMs: response.responseMs, htmlBytes: response.body.length };
    await db.siteScan.updateMany({ where: { id: scan.id, shop: job.shop }, data: { status: "completed", report: JSON.stringify(report), error: null } });
  } catch (error) {
    await db.siteScan.updateMany({ where: { id: scan.id, shop: job.shop }, data: { status: "failed", error: error.message } });
    throw error;
  }
}
