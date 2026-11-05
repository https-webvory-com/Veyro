import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadTechnical, handleTechnical } from "../services/technical.server";
import "../styles/veyro.css";
import "../styles/technical.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return loadTechnical({ admin, shop: session.shop });
};
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return handleTechnical({ admin, shop: session.shop, formData: await request.formData() });
};

/* eslint-disable react/prop-types */
function ScanReport({ scan }) {
  const report = scan.report;
  return <article className="technical-scan">
    <div className="technical-scan-heading"><div><h3>{scan.url}</h3><p className="v-help">{new Date(scan.createdAt).toLocaleString()}</p></div><span className="v-status">{scan.status}</span></div>
    {scan.error && <p className="v-error-text" role="alert">{scan.error}</p>}
    {!report && !scan.error && <p className="v-help">Waiting for the background worker. Refresh results to check progress.</p>}
    {report && <>
      <div className="technical-metrics"><div><span>HTTP status</span><strong>{report.statusCode}</strong></div><div><span>Broken links observed</span><strong>{report.brokenCount}<small> / {report.checkedLinks} checked</small></strong></div><div><span>HTTP response time</span><strong>{report.responseMs}<small> ms</small></strong></div></div>
      <dl className="technical-findings"><dt>Page title</dt><dd>{report.title || "Not found in HTML"}</dd><dt>Meta description</dt><dd>{report.description || "Not found in HTML"}</dd><dt>Canonical URL</dt><dd>{report.canonical || "Not found in HTML"}</dd><dt>H1 headings</dt><dd>{report.h1Count} observed</dd><dt>Product structured data</dt><dd>{report.hasProductSchema ? "Observed" : "Not observed"}</dd><dt>Organization structured data</dt><dd>{report.hasOrganizationSchema ? "Observed" : "Not observed"}</dd><dt>Robots noindex</dt><dd>{report.robotsNoindex ? "Observed — review whether this page should be indexed" : "Not observed"}</dd><dt>HTML size</dt><dd>{Math.round(report.htmlBytes / 1024)} KB</dd></dl>
      <p className="v-help">Observations from public HTML. Product data may be unnecessary on non-product pages. Response time is not a Core Web Vitals measurement.</p>
      <details className="technical-links"><summary>Checked links ({report.checkedLinks} of {report.totalLinks} discovered)</summary><ul>{(report.links || []).map((link, index) => <li key={`${link.url}-${index}`}><span className={link.error || link.status >= 400 ? "v-error-text" : ""}>{link.error || `HTTP ${link.status}`}</span><span>{link.url}</span></li>)}</ul></details>
    </>}
  </article>;
}
function GoogleReports({ integrations, configured, busy }) {
  const metric = (value, suffix = "") => typeof value === "number" ? `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })}${suffix}` : "Unavailable";
  const definitions = [
    { kind: "performance", title: "Mobile performance", button: "Measure mobile performance", enabled: configured.pageSpeed },
    { kind: "searchConsole", title: "Search Console", button: "Sync Search Console", enabled: configured.searchConsole },
    { kind: "sitemapSubmit", title: "Shopify sitemap", button: "Submit Shopify sitemap", enabled: configured.searchConsole },
  ];
  return <section className="v-panel" aria-labelledby="technical-google"><div className="v-panel-heading"><div><div className="v-eyebrow">03 / MEASURE</div><h2 id="technical-google">Google tools</h2><p>Queue measurements and indexing requests, then refresh to see results.</p></div></div>
    {definitions.map((definition) => {
      const integration = integrations.find((item) => item.kind === definition.kind);
      const report = integration?.report;
      return <article className="technical-scan" key={definition.kind}><div className="technical-scan-heading"><h3>{definition.title}</h3><Form method="post"><input type="hidden" name="intent" value={definition.kind} /><button className="v-button v-secondary" disabled={busy || !definition.enabled} type="submit">{definition.button}</button></Form></div>
        {!definition.enabled && <p className="v-help">Server configuration is required to enable this integration. Ask your app administrator to complete Google setup.</p>}
        {integration?.error && <p className="v-error-text" role="alert">{integration.error}</p>}
        {integration?.updatedAt && <p className="v-help">Last integration update: {new Date(integration.updatedAt).toLocaleString()}. {integration.error && report ? "The previous successful report is retained below and may be out of date." : "Saved results do not update until a new job completes."}</p>}
        {!report && <p className="v-help">No successful report yet.</p>}
        {report && definition.kind === "performance" && <><div className="technical-metrics"><div><span>Mobile lab score</span><strong>{metric(report.score)}<small> / 100</small></strong></div><div><span>Largest contentful paint</span><strong>{metric(report.lcpMs, " ms")}</strong></div><div><span>Cumulative layout shift</span><strong>{metric(report.cls)}</strong></div></div><p className="v-help">Total blocking time: {metric(report.totalBlockingTimeMs, " ms")}. Measured {report.measuredAt ? new Date(report.measuredAt).toLocaleString() : "at an unavailable time"} for {report.url}. These are Lighthouse lab measurements, not real-user Core Web Vitals.</p>{report.opportunities?.length > 0 && <ul className="technical-opportunities">{report.opportunities.map((item, index) => <li key={`${item.title}-${index}`}><span>{item.title}</span><strong>{metric(item.savingsMs, " ms estimated savings")}</strong></li>)}</ul>}</>}
        {report && definition.kind === "searchConsole" && <><p className="v-help">{report.property}<br />Reporting period: {report.startDate} to {report.endDate}</p><div className="technical-metrics"><div><span>Clicks</span><strong>{metric(report.clicks)}</strong></div><div><span>Impressions</span><strong>{metric(report.impressions)}</strong></div><div><span>Click-through rate</span><strong>{metric(typeof report.ctr === "number" ? report.ctr * 100 : null, "%")}</strong></div></div>{report.impressions === 0 && <p className="v-help">No search impressions were returned for this period.</p>}</>}
        {report && definition.kind === "sitemapSubmit" && <p className="v-help">Submitted {report.submittedAt ? new Date(report.submittedAt).toLocaleString() : "successfully"}<br />{report.sitemap}<br />Property: {report.property}. Submission does not guarantee indexing.</p>}
      </article>;
    })}
    <div className="technical-redirect-list"><p className="v-help">Google jobs require the background worker. Search Console uses your verified Shopify primary domain as a URL-prefix property; the configured service account must have access to that property.</p></div>
  </section>;
}
/* eslint-enable react/prop-types */

export default function Technical() {
  const { storeUrl, scans = [], redirects = [], integrations = [], googleConfigured = {}, error } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const location = useLocation();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  const baseUrl = storeUrl?.replace(/\/$/, "");
  return <main className="veyro technical" aria-busy={busy}>
    <header className="v-header"><div><div className="v-eyebrow">VEYRO / STOREFRONT HEALTH</div><h1>Find the gaps in your storefront.</h1><p>Inspect a page, review broken links, and give old URLs a new destination.</p></div><Link className="v-button v-secondary" to={`/app/seo${location.search}`}>Product SEO</Link></header>
    {(error || result?.error) && <div className="v-notice v-error" role="alert">{result?.error || error}</div>}
    {result?.message && !result?.error && <div className="v-notice" role="status">{result.message}</div>}
    {busy && <div className="v-processing" role="status">{revalidator.state !== "idle" ? "Refreshing scan results…" : "Processing your request…"}</div>}
    <div className="v-workspace"><div className="v-main-column">
      <section className="v-panel" aria-labelledby="technical-inspect"><div className="v-panel-heading"><div><div className="v-eyebrow">01 / INSPECT</div><h2 id="technical-inspect">Run a storefront scan</h2><p>Public HTML, metadata, structured data, and up to 20 same-store links.</p></div></div><Form method="post" className="technical-form"><input type="hidden" name="intent" value="scan" /><label htmlFor="scan-path">Store page path</label><div className="technical-inline"><input id="scan-path" name="path" defaultValue="/" placeholder="/products/product-handle" pattern="/.*" required maxLength={1000} /><button className="v-button" type="submit" disabled={busy || !storeUrl}>Queue scan</button></div><p className="v-help">Use / for your homepage or a path such as /products/linen-shirt. Scans run in the background and require the worker to be running.</p></Form></section>
      <section className="v-panel" aria-labelledby="technical-results"><div className="v-panel-heading"><div><h2 id="technical-results">Scan results</h2><p>Your 10 most recent scans. Review observations before making changes.</p></div><button type="button" className="v-button v-secondary" onClick={() => revalidator.revalidate()} disabled={busy}>Refresh</button></div>{scans.length ? scans.map((scan) => <ScanReport key={scan.id} scan={scan} />) : <div className="v-empty"><h3>A clearer view of your storefront.</h3><p>Queue your first page scan to inspect metadata, structured data, and links.</p></div>}</section>
      <section className="v-panel" aria-labelledby="technical-redirects"><div className="v-panel-heading"><div><div className="v-eyebrow">02 / REPAIR</div><h2 id="technical-redirects">URL redirects</h2><p>Send visitors from a missing URL to a relevant page in your store.</p></div></div><Form method="post" className="technical-form"><input type="hidden" name="intent" value="redirect" /><div className="technical-redirect-fields"><div><label htmlFor="redirect-path">Old path</label><input id="redirect-path" name="path" placeholder="/products/old-shirt" required pattern="/.*" maxLength={1000} /></div><div><label htmlFor="redirect-target">New destination path</label><input id="redirect-target" name="target" placeholder="/products/new-shirt" required pattern="/.*" maxLength={1000} /></div></div><p className="v-help">Both paths must start with /. Creating a redirect writes to Shopify. The old path must return HTTP 404 or 410, and the destination must return a successful 2xx response.</p><button className="v-button" type="submit" disabled={busy}>Create redirect</button></Form>{redirects.length ? <div className="technical-redirect-list"><div className="v-eyebrow">EXISTING REDIRECTS · FIRST 50</div><dl>{redirects.map((redirect) => <div key={redirect.id}><dt>{redirect.path}</dt><dd><span aria-hidden="true">→ </span>{redirect.target}</dd></div>)}</dl></div> : <div className="technical-redirect-list"><p className="v-help">No redirects loaded. Created redirects will appear here after saving.</p></div>}</section>
    <GoogleReports integrations={integrations} configured={googleConfigured} busy={busy} /></div><aside className="v-side-column"><section className="v-guide"><div className="v-eyebrow">UNDERSTAND YOUR RESULTS</div><h2>Observed.<br />Then improved.</h2><ol><li><span>01</span><div><strong>Inspect the public page</strong><p>Password protection or app-rendered content can limit what a scan sees.</p></div></li><li><span>02</span><div><strong>Review the context</strong><p>Missing structured data is an observation, not a universal failure. Check the page type and your theme.</p></div></li><li><span>03</span><div><strong>Repair relevant links</strong><p>Use redirects for removed pages with a useful replacement.</p></div></li></ol><p className="v-guide-foot">Scans inspect existing markup. Theme changes and structured data injection are not performed automatically.</p></section><section className="v-panel technical-tools"><div className="v-eyebrow">OPTIONAL THEME EMBED</div><h2>Veyro missing schema</h2><p>The embed is disabled by default. Enable it and choose the desired schema types in your Shopify theme editor. It adds markup with JavaScript only when that type is absent.</p><p className="v-help">The raw HTML scan cannot see JavaScript-injected markup. Check the rendered page with the Google Rich Results Test after enabling it.</p><a href="https://search.google.com/test/rich-results" target="_blank" rel="noreferrer">Open Rich Results Test</a></section><section className="v-panel technical-tools"><div className="v-eyebrow">EXTERNAL TOOLS</div><h2>Continue your checks</h2><p>Open these tools separately to inspect indexing and real page performance.</p><nav aria-label="External storefront tools">{baseUrl && <><a href={`${baseUrl}/sitemap.xml`} target="_blank" rel="noreferrer">View Shopify sitemap <span aria-hidden="true">↗</span></a><a href={`${baseUrl}/robots.txt`} target="_blank" rel="noreferrer">View robots.txt <span aria-hidden="true">↗</span></a><a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(baseUrl)}`} target="_blank" rel="noreferrer">Run PageSpeed Insights <span aria-hidden="true">↗</span></a></>}<a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Open Google Search Console <span aria-hidden="true">↗</span></a></nav><p className="v-help">Use Google tools above for configured integrations, or open the external tools directly. Search Console access requires server setup.</p></section></aside></div>
    <footer className="v-footer">VEYRO <span>Useful checks. Clear next steps.</span></footer>
  </main>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
