import { useState } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadSeoDashboard, handleSeoAction } from "../services/seo.server";
import "../styles/veyro.css";
import "../styles/seo.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return loadSeoDashboard({ admin, shop: session.shop, request });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return handleSeoAction({ admin, shop: session.shop, formData: await request.formData() });
};

/* Internal component receives authenticated loader records. */
/* eslint-disable react/prop-types */
function Draft({ draft, busy, storeUrl, product }) {
  const [title, setTitle] = useState(draft.title || "");
  const [description, setDescription] = useState(draft.description || "");
  const editable = draft.status === "pending";
  return <article className="seo-draft">
    <div className="v-review-title"><h3>{draft.productTitle}</h3><span className="v-status">{draft.status}</span></div>
    {draft.error && <p className="v-error-text" role="alert">{draft.error}</p>}
    {editable ? <Form method="post" className="seo-editor">
      <input type="hidden" name="draftId" value={draft.id} />
      <div className="seo-fields">
        <label htmlFor={`title-${draft.id}`}>Search title <span>{title.length}/70</span></label>
        <input id={`title-${draft.id}`} name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={70} required />
        <label htmlFor={`description-${draft.id}`}>Meta description <span>{description.length}/320</span></label>
        <textarea id={`description-${draft.id}`} name="description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={320} rows={4} required />
      </div>
      <div className="seo-preview"><div className="v-eyebrow">SEARCH RESULT PREVIEW</div><p className="seo-url">{storeUrl || "Your store"} / products / {draft.handle || product?.handle || "product-handle"}</p><p className="seo-preview-title">{title || "Your search title"}</p><p className="seo-preview-description">{description || "Your meta description will appear here."}</p><p className="seo-preview-note">Illustrative preview. Search engines may rewrite or shorten this text.</p></div>
      <div className="seo-editor-actions"><button className="v-button" type="submit" name="intent" value="save" disabled={busy || !title.trim() || !description.trim()}>Publish SEO changes</button><button className="v-button v-quiet" type="submit" name="intent" value="dismiss" formNoValidate disabled={busy}>Dismiss</button></div>
    </Form> : <dl className="seo-history"><dt>{draft.status === "applied" ? "Published title" : "Draft title"}</dt><dd>{draft.title}</dd><dt>{draft.status === "applied" ? "Published description" : "Draft description"}</dt><dd>{draft.description}</dd></dl>}
    {draft.status === "applying" && <Form method="post" className="seo-reconcile"><input type="hidden" name="draftId" value={draft.id} /><input type="hidden" name="intent" value="reconcile" /><p className="v-help">This update is in progress or was interrupted. Wait at least two minutes after publishing, then check its status.</p><button className="v-button v-secondary" type="submit" disabled={busy}>Check update status</button></Form>}
    <details className="seo-original"><summary>Previous SEO overrides</summary><dl className="seo-history"><dt>Title</dt><dd>{draft.originalTitle || "No override — Shopify uses the product title."}</dd><dt>Description</dt><dd>{draft.originalDescription || "No override — Shopify uses product content."}</dd></dl></details>
  </article>;
}

/* eslint-enable react/prop-types */
export default function Seo() {
  const { products = [], drafts = [], pageInfo = {}, storeUrl, error } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const location = useLocation();
  const [selected, setSelected] = useState([]);
  const busy = navigation.state !== "idle";
  const activeSelected = selected.filter((id) => products.some((product) => product.id === id));
  const pending = drafts.filter((draft) => draft.status === "pending");
  const history = drafts.filter((draft) => draft.status !== "pending");
  const passed = products.reduce((sum, product) => sum + product.audit.passed, 0);
  const total = products.reduce((sum, product) => sum + product.audit.total, 0);
  function pageLink(after) {
    const params = new URLSearchParams(location.search);
    if (after) params.set("after", after); else params.delete("after");
    return `${location.pathname}?${params.toString()}`;
  }
  const imageParams = new URLSearchParams(location.search);
  imageParams.delete("after");
  return <main className="veyro seo" aria-busy={busy}>
    <header className="v-header"><div><div className="v-eyebrow">VEYRO / SEARCH VISIBILITY</div><h1>Make every product easier to find.</h1><p>Check the essentials. Refine your search listings. Publish with confidence.</p></div><Link className="v-button v-secondary" to={`/app?${imageParams.toString()}`}>Manage image ALT <span aria-hidden="true">↗</span></Link></header>
    {(error || result?.error) && <div className="v-notice v-error" role="alert">{result?.error || error}</div>}
    {result?.message && !result?.error && <div className="v-notice" role="status">{result.message}</div>}
    {busy && <div className="v-processing" role="status">{navigation.state === "loading" && !navigation.formData ? "Loading products…" : navigation.formData?.get("intent") === "draft" ? "Preparing your SEO drafts…" : "Saving your changes…"}</div>}
    <section className="v-overview" aria-label="SEO overview for this page"><div><span>Products on this page</span><strong>{products.length}</strong></div><div><span>Checks passed</span><strong>{passed}<small> of {total} checks on this page</small></strong></div><div><span>Drafts to review</span><strong>{pending.length}<small> loaded drafts</small></strong></div><div className="v-overview-note"><span className="v-dot" /><p><strong>A checklist, not a ranking.</strong><br />These checks do not predict search position.</p></div></section>
    <div className="v-workspace"><div className="v-main-column">
      <section className="v-panel" aria-labelledby="seo-products"><div className="v-panel-heading"><div><h2 id="seo-products">Product SEO audit</h2><p>Review content checks, then prepare editable suggestions.</p></div><span className="v-count">20 per page</span></div>
        {products.length ? <Form method="post"><input type="hidden" name="intent" value="draft" /><div className="seo-bulk"><label><input type="checkbox" ref={(node) => { if (node) node.indeterminate = activeSelected.length > 0 && activeSelected.length < products.length; }} checked={activeSelected.length === products.length} onChange={(event) => setSelected(event.target.checked ? products.map((product) => product.id) : [])} disabled={busy} /> Select this page</label><button className="v-button" type="submit" disabled={busy || !activeSelected.length}>Prepare SEO drafts{activeSelected.length ? ` (${activeSelected.length})` : ""}</button></div><ul className="seo-products">{products.map((product) => <li key={product.id}><div className="seo-product-heading"><label className="seo-product-select" aria-label={`Select ${product.title}`} htmlFor={`product-${product.id}`}><input id={`product-${product.id}`} name="productIds" type="checkbox" value={product.id} checked={activeSelected.includes(product.id)} disabled={busy} onChange={(event) => setSelected(event.target.checked ? [...activeSelected, product.id] : activeSelected.filter((id) => id !== product.id))} /><span><strong>{product.title}</strong><small>/products/{product.handle}</small></span></label><span className="v-count">{product.audit.passed}/{product.audit.total} checks</span></div><details className="seo-checks"><summary>{product.audit.total - product.audit.passed ? `${product.audit.total - product.audit.passed} ${product.audit.total - product.audit.passed === 1 ? "check needs" : "checks need"} attention` : "All checks passed"} · View checklist</summary><ul>{product.audit.checks.map((check) => <li key={check.id}><span className={check.passed ? "seo-pass" : "seo-attention"}>{check.passed ? "Pass" : "Review"}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></li>)}</ul></details>{(!product.seo.title || !product.seo.description) && <p className="seo-fallback">Missing SEO overrides use Shopify’s product title or content fallback.</p>}{product.mediaTruncated && <p className="seo-fallback">Image checks cover only the loaded media, not every image.</p>}</li>)}</ul></Form> : <div className="v-empty"><h3>{error ? "Product audit unavailable" : "No products on this page"}</h3><p>{error ? "Resolve the error above, then reload to run your audit." : "Add products in Shopify or return to the first page to begin."}</p></div>}
        <div className="v-panel-footer seo-pagination"><span>Checks cover this page and up to 20 media items per product.</span><div>{new URLSearchParams(location.search).has("after") && <Link className="v-button v-quiet" to={pageLink(null)}>First page</Link>}{pageInfo.hasNextPage && pageInfo.endCursor && <Link className="v-button v-secondary" to={pageLink(pageInfo.endCursor)}>Next products →</Link>}</div></div>
      </section>
      <section className="v-panel" id="seo-review" aria-labelledby="seo-drafts"><div className="v-panel-heading"><div><div className="v-eyebrow">REVIEW BEFORE PUBLISHING</div><h2 id="seo-drafts">Your search listings</h2><p>Suggestions use existing product content. Up to 50 records, active drafts first.</p></div><span className="v-count">{pending.length} pending</span></div>{pending.length ? pending.map((draft) => <Draft key={`${draft.id}-${draft.title}-${draft.description}`} draft={draft} busy={busy} storeUrl={storeUrl} product={products.find((product) => product.id === draft.productId)} />) : <div className="v-empty"><span className="v-empty-mark" aria-hidden="true">+</span><h3>A clearer listing starts here.</h3><p>Select products above to prepare title and description drafts. Review and publish each one when it is ready.</p></div>}</section>
      {history.length > 0 && <section className="v-panel" aria-labelledby="seo-history"><div className="v-panel-heading"><div><h2 id="seo-history">Recent activity</h2><p>Showing up to 50 records, active drafts first.</p></div></div>{history.map((draft) => <Draft key={draft.id} draft={draft} busy={busy} storeUrl={storeUrl} />)}</section>}
    </div><aside className="v-side-column"><section className="v-guide"><div className="v-eyebrow">THE SEARCH ESSENTIALS</div><h2>Small details.<br />Clearer discovery.</h2><ol><li><span>01</span><div><strong>Check your content</strong><p>Find missing metadata, missing descriptions, and images without ALT text.</p></div></li><li><span>02</span><div><strong>Give each listing context</strong><p>Prepare rule-based drafts from product content, then edit the wording for your customers.</p></div></li><li><span>03</span><div><strong>Review, then publish</strong><p>Publishing updates the product’s search title and meta description in Shopify.</p></div></li></ol><p className="v-guide-foot">An SEO override is optional. Shopify provides fallbacks, and search engines decide how your listing appears.</p></section><section className="v-panel seo-scope"><div className="v-eyebrow">WHAT THIS WORKSPACE COVERS</div><h2>Product SEO foundations</h2><p>Content audits, title and description drafts, search previews, and publishing history.</p><p>Storewide crawling, speed optimization, redirects, and structured data are not included in these checks.</p></section></aside></div>
    <footer className="v-footer">VEYRO <span>Useful content. Thoughtful search listings.</span></footer>
  </main>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);


