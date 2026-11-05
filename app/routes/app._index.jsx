import { useState } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadDashboard, handleDashboardAction } from "../services/veyro.server";
import "../styles/veyro.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return loadDashboard({ admin, shop: session.shop });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  return handleDashboardAction({ admin, shop: session.shop, formData: await request.formData() });
};

export default function Index() {
  const { products = [], reviews = [], settings, configured, error } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const busy = navigation.state !== "idle";
  const pending = reviews.filter((review) => review.status === "pending");
  const images = products.flatMap((product) => product.images);
  const filtered = products.filter((product) => product.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="veyro" aria-busy={busy}>
      <header className="v-header">
        <div><div className="v-eyebrow">VEYRO / IMAGE INTELLIGENCE</div><h1>Good images. Better context.</h1><p>Turn your product photography into clear, useful ALT text.</p></div>
        <Link className="v-button v-secondary" to={`/app/automation${location.search}`}>Automation & settings</Link>
      </header>
      {(error || result?.error) && <div className="v-notice v-error" role="alert">{result?.error || error}</div>}
      {result?.message && !result?.error && <div className="v-notice" role="status">{result.message}</div>}
      {!configured && <div className="v-notice"><strong>Connect image analysis to get started.</strong> Add your OpenAI key and vision model in <Link to={`/app/settings${location.search}`}>AI settings</Link>. Your product library and ALT settings are available while you set up.</div>}
      {busy && <div className="v-processing" role="status">{navigation.formData?.get("intent") === "analyze" ? "Analyzing product images. This can take a moment…" : "Saving your changes…"}</div>}
      <section className="v-overview" aria-label="Library overview">
        <div><span>Products loaded</span><strong>{products.length}<small> latest products</small></strong></div>
        <div><span>Images without ALT</span><strong>{images.filter((item) => !item.alt?.trim()).length}<small> in this selection</small></strong></div>
        <div><span>Ready for review</span><strong>{pending.length}<small> suggestions</small></strong></div>
        <div className="v-overview-note"><span className="v-dot" /><p><strong>{settings?.autoApprove ? "Your rules, applied." : "You make the final call."}</strong><br />{settings?.autoApprove ? "Confident background suggestions can publish automatically." : "Review suggestions before they go live."}</p></div>
      </section>
      <div className="v-workspace">
        <div className="v-main-column">
          <section className="v-panel" aria-labelledby="products-title">
            <div className="v-panel-heading"><div><h2 id="products-title">Product library</h2><p>Analyze one image at a time, then review its suggestion.</p></div><span className="v-count">{products.length} products</span></div>
            <div className="v-search"><label className="v-sr-only" htmlFor="product-search">Search loaded products</label><input id="product-search" type="search" placeholder="Search loaded products…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
            {filtered.length ? <ul className="v-products">{filtered.map((product) => <li key={product.id} className="v-product">
              {product.images[0]?.url ? <img className="v-thumbnail" src={product.images[0].url} alt={product.images[0].alt || product.title} loading="lazy" /> : <span className="v-thumbnail v-placeholder" aria-label="No product image">—</span>}
              <div className="v-product-copy"><h3>{product.title}</h3><p>{product.category || "Uncategorized"} <span aria-hidden="true">·</span> {product.images.length} images</p><div className="v-colors">{product.colors.length ? product.colors.join(" / ") : "No color options"}</div></div>
              <Form method="post"><input type="hidden" name="intent" value="analyze" /><input type="hidden" name="productId" value={product.id} /><button className="v-button v-secondary" disabled={busy || !configured || !product.images.length} type="submit">Analyze next image <span aria-hidden="true">+</span></button></Form>
            </li>)}</ul> : <div className="v-empty"><span className="v-empty-mark" aria-hidden="true">+</span><h3>{query ? "No matching products" : "Your image library starts here"}</h3><p>{query ? "Try another product name." : "Products with images will appear here once they are available in your store."}</p></div>}
            <div className="v-panel-footer">Showing the latest 20 products and up to 20 images per product. Each run analyzes the next unreviewed image.</div>
          </section>
          <section className="v-panel" aria-labelledby="review-title">
            <div className="v-panel-heading"><div><div className="v-eyebrow">THE FINAL TOUCH</div><h2 id="review-title">Review suggestions</h2><p>Check the image, color, and description. Showing up to 100 reviews: active suggestions first, oldest first, followed by recent completed reviews.</p></div><span className="v-count">{pending.length} pending</span></div>
            {reviews.length ? <div className="v-reviews">{reviews.map((review) => <article className="v-review" key={review.id}>
              {review.imageUrl && <img src={review.imageUrl} alt={review.originalAlt || review.productTitle} loading="lazy" />}
              <div className="v-review-content"><div className="v-review-title"><h3>{review.productTitle}</h3><span className="v-status">{review.status}</span></div><p className="v-review-meta">{review.detectedColor || "Color not identified"}{review.confidence != null && ` · ${Math.round(review.confidence)}% confidence`}</p><p className="v-review-meta">Matched option: {review.matchedColor || "No confident match"}</p>{review.status === "pending" && (review.confidence < (settings?.confidenceThreshold ?? 95) || !review.matchedColor) && <p className="v-review-warning">Needs a closer look: {review.matchedColor ? "confidence is below your threshold." : "no matching color option was identified."}</p>}<dl><dt>{review.status === "applied" ? "ALT before analysis" : "Current ALT"}</dt><dd>{review.originalAlt || "No ALT text"}</dd><dt>Suggested ALT</dt><dd className="v-suggestion">{review.generatedAlt || "No suggestion available"}</dd></dl>{review.variantStatus && <p className="v-review-meta">Variant images: {review.variantStatus}</p>}{review.error && <p className="v-error-text">{review.error}</p>}{review.status === "pending" && <Form method="post" className="v-review-actions"><input type="hidden" name="reviewId" value={review.id} /><label htmlFor={`alt-${review.id}`}>Edit ALT before publishing</label><textarea id={`alt-${review.id}`} name="generatedAlt" defaultValue={review.generatedAlt || ""} maxLength={512} required rows={3} /><label style={{ display: "flex", alignItems: "start", gap: 8, fontWeight: 400 }}><input type="checkbox" name="assignVariants" style={{ width: 16, flexShrink: 0 }} disabled={!review.matchedColor || review.confidence < 70} /><span>Also fill empty variant images for this color (requires at least 70% confidence).</span></label><button type="submit" name="intent" value="approve" className="v-button" disabled={busy || !review.generatedAlt}>Approve & publish</button><button type="submit" formNoValidate name="intent" value="dismiss" className="v-button v-quiet" disabled={busy}>Dismiss</button></Form>}</div>
            </article>)}</div> : <div className="v-empty"><span className="v-empty-mark" aria-hidden="true">+</span><h3>A little review goes a long way.</h3><p>Analyze a product above to see AI descriptions and color suggestions here. {settings?.autoApprove ? "Confident background suggestions may publish automatically under your saved rules." : "Suggestions wait for your approval before publishing."}</p></div>}
          </section>
        </div>
        <aside className="v-side-column">
          <section className="v-guide"><div className="v-eyebrow">FROM IMAGE TO UNDERSTANDING</div><h2>A thoughtful workflow.</h2><ol><li><span>01</span><div><strong>See the details</strong><p>AI examines each image for visible product attributes.</p></div></li><li><span>02</span><div><strong>Find the color</strong><p>Compare the detected color with your product options.</p></div></li><li><span>03</span><div><strong>Make it meaningful</strong><p>Generate ALT text with your template. Review, then publish.</p></div></li></ol><p className="v-guide-foot">Assign images to matching color variants when approving. Configure background processing and automatic publishing in Automation.</p></section>
          <section className="v-panel v-settings" id="settings" aria-labelledby="settings-title"><div className="v-eyebrow">YOUR PREFERENCES</div><h2 id="settings-title">ALT text settings</h2><Form method="post"><input type="hidden" name="intent" value="settings" /><label htmlFor="alt-template">Description template</label><textarea id="alt-template" name="altTemplate" defaultValue={settings?.altTemplate || "[Category] [Product Title] [Color]"} required maxLength={300} rows={3} /><p className="v-help">Available fields: [Category], [Product Title], [Color]. Title colors and categories are not repeated.</p><label htmlFor="confidence">Confidence threshold (%)</label><input id="confidence" type="number" name="confidenceThreshold" min="70" max="100" step="1" required defaultValue={settings?.confidenceThreshold ?? 95} /><p className="v-help">Used to flag color matches for closer review. Automatic publishing, when enabled, requires at least 95% confidence.</p><button type="submit" className="v-button v-secondary" disabled={busy}>Save settings</button></Form></section>
        </aside>
      </div>
      <footer className="v-footer">VEYRO <span>Clearer descriptions. More accessible products.</span></footer>
    </main>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);





