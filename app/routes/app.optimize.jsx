import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Form, useActionData, useLoaderData, useLocation, useNavigation, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadOptimizer, handleOptimizer } from "../services/optimizer.server";
import "../styles/veyro.css";
import "../styles/optimize.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return loadOptimizer({ admin, shop: session.shop });
};
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return handleOptimizer({ admin, shop: session.shop, formData: await request.formData() });
};

function bytes(value) {
  return value == null ? "Not measured" : `${Number(value).toLocaleString()} bytes`;
}

/* eslint-disable react/prop-types */
function PreviewImage({ src, alt }) {
  const shopify = useAppBridge();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl;
    setPreview(null);
    setError(false);
    async function load() {
      try {
        const token = await shopify.idToken();
        if (controller.signal.aborted) return;
        const response = await fetch(src, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Preview unavailable");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, shopify]);
  if (error) return <p className="opt-preview-message" role="alert">Preview unavailable. Reload this page to try again.</p>;
  return preview ? <img src={preview} alt={alt} onError={() => setError(true)}/> : <p className="opt-preview-message" role="status">Loading preview…</p>;
}
/* eslint-enable react/prop-types */

export default function Optimize() {
  const { images = [], optimizations = [], error } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const location = useLocation();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  const working = ["queued", "applying", "restoring"];
  const ready = optimizations.filter((record) => record.status === "prepared");
  const saved = optimizations.filter((record) => record.status === "applied").reduce((total, record) => total + Math.max(0, (record.originalBytes || 0) - (record.optimizedBytes || 0)), 0);
  function preview(id, variant) {
    const params = new URLSearchParams(location.search);
    params.set("id", id);
    params.set("variant", variant);
    return `/app/optimization-preview?${params}`;
  }
  return <main className="veyro optimize" aria-busy={busy}>
    <header className="v-header"><div><div className="v-eyebrow">VEYRO / IMAGE OPTIMIZATION</div><h1>Lighter images. A careful finish.</h1><p>Prepare a smaller image, inspect the result, then publish when it looks right.</p></div><button className="v-button v-secondary" type="button" disabled={busy} onClick={() => revalidator.revalidate()}>{revalidator.state === "loading" ? "Refreshing…" : "Refresh status"}</button></header>
    {(error || result?.error) && <div className="v-notice v-error" role="alert">{result?.error || error}</div>}
    {result?.message && !result.error && <div className="v-notice" role="status">{result.message}</div>}
    {busy && <p className="v-processing" role="status">Updating the optimization workspace…</p>}
    <section className="v-overview" aria-label="Loaded optimization overview"><div><span>Available images</span><strong>{images.length}<small> latest 30 files</small></strong></div><div><span>Ready to inspect</span><strong>{ready.length}</strong></div><div><span>Published savings</span><strong className="opt-savings">{bytes(saved)}<small> applied records shown below</small></strong></div><div className="v-overview-note"><span className="v-dot"/><p><strong>Review before publishing.</strong><br/>Originals are backed up before an update.</p></div></section>
    <div className="v-workspace"><div className="v-main-column">
      <section className="v-panel" aria-labelledby="opt-images"><div className="v-panel-heading"><div><h2 id="opt-images">Choose an image</h2><p>JPEG and PNG originals only. Quality controls JPEG compression; PNG compression is lossless. Resizing preserves proportions and never enlarges an image.</p></div></div>
        {images.length ? <ul className="opt-images">{images.map((item, index) => {
          const pending = optimizations.some((record) => record.mediaId === item.id && working.includes(record.status));
          return <li key={item.id}><div className="opt-source"><img src={item.url} alt={item.alt || "Store image"} loading="lazy"/><div><h3>{item.alt || `Image ${index + 1}`}</h3><p>{item.width && item.height ? `${item.width} × ${item.height} px` : "Dimensions unavailable"}</p></div></div><Form method="post" className="opt-prepare"><input type="hidden" name="intent" value="prepare"/><input type="hidden" name="mediaId" value={item.id}/><label htmlFor={`quality-${index}`}>Quality<input id={`quality-${index}`} type="number" name="quality" min="50" max="95" step="1" defaultValue="80" required disabled={busy || pending}/></label><label htmlFor={`width-${index}`}>Max width (px)<input id={`width-${index}`} type="number" name="maxWidth" min="320" max="4096" step="1" defaultValue="2048" required disabled={busy || pending}/></label><button className="v-button v-secondary" type="submit" disabled={busy || pending}>{pending ? "Processing…" : "Prepare preview"}</button></Form></li>;
        })}</ul> : <div className="v-empty"><h3>{error ? "Images could not be loaded" : "No images available"}</h3><p>{error ? "Resolve the error above and refresh this workspace." : "Add JPEG or PNG images to Shopify Files to begin."}</p></div>}
      </section>
      <section className="v-panel" aria-labelledby="opt-review"><div className="v-panel-heading"><div><div className="v-eyebrow">INSPECT / PUBLISH / RESTORE</div><h2 id="opt-review">Optimization history</h2><p>Latest 50 records. Refresh status to see background work finish.</p></div></div>
        {!optimizations.length && <div className="v-empty"><h3>Your first preview starts above.</h3><p>Preparation does not publish changes. Compare the original and optimized image here before applying.</p></div>}
        {optimizations.map((record) => {
          const hasPreview = ["prepared", "applied", "restored", "applying", "restoring"].includes(record.status) && record.optimizedBytes != null;
          const difference = record.originalBytes != null && record.optimizedBytes != null ? record.originalBytes - record.optimizedBytes : null;
          return <article className="opt-record" key={record.id}><div className="opt-record-heading"><h3>{images.find((item) => item.id === record.mediaId)?.alt || "Image optimization"}</h3><span className="v-status">{record.status}</span></div><p className="opt-record-id">{record.mediaId}</p>
            {record.error && <div role="alert"><p className="v-error-text">{record.error}</p>{["applying", "restoring"].includes(record.status) && <p className="v-help">The worker retries up to three times. If the job has failed, open Automation and retry that failed job to finish this update.</p>}</div>}
            {working.includes(record.status) && <p className="opt-progress" role="status">{record.status === "queued" ? "Waiting for the worker to prepare a preview." : record.status === "applying" ? "Publishing the optimized image." : "Restoring the saved original."} Refresh status to check progress.</p>}
            {hasPreview && <div className="opt-comparison"><figure><PreviewImage src={preview(record.id, "original")} alt="Original before optimization"/><figcaption><strong>Original</strong><span>{bytes(record.originalBytes)}</span></figcaption></figure><figure><PreviewImage src={preview(record.id, "optimized")} alt="Prepared optimized version"/><figcaption><strong>Optimized</strong><span>{bytes(record.optimizedBytes)}</span></figcaption></figure></div>}
            {difference != null && <p className="opt-measure">{difference > 0 ? `${bytes(difference)} smaller (${record.originalBytes > 0 ? Math.round(difference / record.originalBytes * 100) : 0}%)` : "No file-size reduction"}{record.width && record.height ? ` · ${record.width} × ${record.height} px` : ""}</p>}
            {record.status === "unchanged" && <p className="v-help">The prepared file was not smaller. Your Shopify image remains unchanged.</p>}
            {record.status === "prepared" && <p className="opt-advisory">Inspect fine details, text, and colors before publishing. Compression can reduce visual quality.</p>}
            {["prepared", "applied"].includes(record.status) && <Form method="post" className="opt-actions"><input type="hidden" name="optimizationId" value={record.id}/><button className={`v-button ${record.status === "applied" ? "v-secondary" : ""}`} type="submit" name="intent" value={record.status === "prepared" ? "apply" : "restore"} disabled={busy}>{record.status === "prepared" ? "Publish optimized image" : "Restore original"}</button></Form>}
          </article>;
        })}
      </section>
    </div><aside className="v-side-column"><section className="v-guide"><div className="v-eyebrow">A CONTROLLED WORKFLOW</div><h2>Keep the detail.<br/>Reduce the weight.</h2><ol><li><span>01</span><div><strong>Prepare</strong><p>Start at quality 80. Choose a maximum width that suits how the image appears in your store.</p></div></li><li><span>02</span><div><strong>Compare</strong><p>Review both images and measured file sizes. A smaller file should still show the product clearly.</p></div></li><li><span>03</span><div><strong>Publish</strong><p>Apply a reviewed preview. Use Restore original if you need to reverse the update.</p></div></li></ol><p className="v-guide-foot">A running background worker is required. Image savings do not measure storefront speed; theme code, apps, and other resources also affect loading.</p></section></aside></div>
    <footer className="v-footer">VEYRO <span>Smaller files. Measured changes.</span></footer>
  </main>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
