import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadAutomation, handleAutomation } from "../services/automation.server";
import "../styles/veyro.css";
import "../styles/automation.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return loadAutomation({ shop: session.shop });
};
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return handleAutomation({ admin, shop: session.shop, formData: await request.formData() });
};

const date = (value) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC" : "Not available";

export default function Automation() {
  const { settings = {}, configured, jobs = [], worker, error } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const location = useLocation();
  const revalidator = useRevalidator();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  const workerRecent = worker?.lastSeenAt && Date.now() - new Date(worker.lastSeenAt).getTime() < 60000;

  return <main className="veyro automation" aria-busy={busy}>
    <header className="v-header"><div><div className="v-eyebrow">VEYRO / AUTOMATION</div><h1>A little less manual work.</h1><p>Process your image library in the background, with rules you control.</p></div><Link className="v-button v-secondary" to={`/app${location.search}`}>Review images</Link></header>
    {(error || result?.error) && <div className="v-notice v-error" role="alert">{result?.error || error}</div>}
    {result?.message && !result?.error && <div className="v-notice" role="status">{result.message}</div>}
    {!configured && <div className="v-notice"><strong>Image analysis needs configuration.</strong> Add your OpenAI key and model in <Link to={`/app/settings${location.search}`}>AI settings</Link> before running image processing.</div>}
    {busy && <p className="v-processing" role="status">Updating automation…</p>}
    <section className="automation-worker" aria-label="Background worker status"><div><span className={`automation-indicator ${workerRecent ? "is-active" : ""}`} aria-hidden="true" /><strong>{workerRecent ? "Worker recently connected" : "Worker connection not confirmed"}</strong><p>Last heartbeat: {date(worker?.lastSeenAt)}{worker?.status ? ` · ${worker.status}` : ""}</p></div><button type="button" className="v-button v-secondary" onClick={() => revalidator.revalidate()} disabled={busy}>Refresh status</button></section>
    {!workerRecent && <p className="automation-worker-note">Queued work waits for the background worker. Refresh to check its connection and task progress.</p>}
    <div className="automation-layout">
      <section className="v-panel v-settings automation-settings" aria-labelledby="automation-settings"><div className="v-eyebrow">PROCESSING RULES</div><h2 id="automation-settings">Set your boundaries</h2>
        <Form method="post" key={JSON.stringify(settings)}><input type="hidden" name="intent" value="settings" />
          <label className="automation-check"><input type="checkbox" name="autoProcess" defaultChecked={settings.autoProcess} /><span>Process new and updated products<small>Product events queue image analysis. Off by default; you can still queue your existing catalog below.</small></span></label>
          <label className="automation-check"><input type="checkbox" name="autoApprove" defaultChecked={settings.autoApprove} /><span>Automatically publish confident ALT suggestions<small>Only fills missing ALT text. Matches must meet your threshold and at least 95% confidence. Other suggestions stay available for review.</small></span></label>
          <label className="automation-check"><input type="checkbox" name="autoAssign" defaultChecked={settings.autoAssign} /><span>Assign matching variant images<small>During automatic publishing, fill variants that have no image using their Color or Colour option. Existing variant images are preserved.</small></span></label>
          <label htmlFor="automation-confidence">Confidence threshold (%)</label><input id="automation-confidence" type="number" name="confidenceThreshold" min="70" max="100" step="1" required defaultValue={settings.confidenceThreshold ?? 95} /><p className="v-help">Automatic publishing always requires at least 95%, even if your review threshold is lower.</p>
          <label htmlFor="automation-template">ALT description template</label><textarea id="automation-template" name="altTemplate" required maxLength={300} rows={3} defaultValue={settings.altTemplate || "[Category] [Product Title] [Color]"} /><p className="v-help">Include [Product Title]. Optional fields: [Category] and [Color]. Up to 300 characters.</p>
          <button className="v-button" type="submit" disabled={busy}>Save automation settings</button>
        </Form>
      </section>
      <aside className="v-guide automation-catalog"><div className="v-eyebrow">EXISTING PRODUCTS</div><h2>Give your catalog a pass.</h2><p>Queue your catalog for background image processing. Suggestions follow your saved rules above.</p><p>If automatic publishing is off, review suggestions in the image manager before publishing.</p><Form method="post"><input type="hidden" name="intent" value="queueCatalog" /><button className="v-button" disabled={busy || !configured} type="submit">Queue catalog images</button></Form><p className="v-guide-foot">Save rule changes before queuing. Processing uses your configured AI service and may incur usage charges.</p></aside>
    </div>
    <section className="v-panel automation-history" aria-labelledby="jobs-title"><div className="v-panel-heading"><div><div className="v-eyebrow">BACKGROUND ACTIVITY</div><h2 id="jobs-title">Task history</h2><p>Refresh status to see the latest outcomes. Times are shown in UTC.</p></div><span className="v-count">{jobs.length} loaded</span></div>
      {jobs.length ? <ol className="automation-jobs">{jobs.map((job) => <li key={job.id}><div className="automation-job-heading"><h3>{job.kind === "catalog" ? "Catalog image processing" : job.kind.replaceAll("_", " ")}</h3><span className={`v-status automation-status-${job.status}`}>{job.status}</span></div><p className="automation-job-meta">{job.productId ? `Product ${job.productId.split("/").pop()} · ` : ""}{job.attempts} attempt{job.attempts === 1 ? "" : "s"} · Updated {date(job.updatedAt)}</p>{job.error && <p className="v-error-text">{job.error}</p>}{["queued", "failed"].includes(job.status) && <Form method="post" className="automation-job-actions"><input type="hidden" name="jobId" value={job.id} />{job.status === "failed" && <button className="v-button v-secondary" name="intent" value="retry" disabled={busy} type="submit">Retry task</button>}<button className="v-button v-quiet" name="intent" value="cancel" disabled={busy} type="submit">Cancel task</button></Form>}</li>)}</ol> : <div className="v-empty"><h3>No background tasks yet</h3><p>Queue your existing catalog, or enable processing for new and updated products to begin.</p></div>}
    </section>
  </main>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
