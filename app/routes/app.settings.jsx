import { useEffect, useRef } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { loadAiSettings, handleAiSettings } from "../services/ai-settings.server";
import "../styles/veyro.css";
import "../styles/ai-settings.css";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return loadAiSettings(session.shop);
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return handleAiSettings({ shop: session.shop, formData: await request.formData() });
};

export default function AiSettings() {
  const { configured, hasKey, model } = useLoaderData();
  const result = useActionData();
  const navigation = useNavigation();
  const location = useLocation();
  const keyInput = useRef(null);
  const busy = navigation.state !== "idle";

  useEffect(() => {
    if (result?.message && !result?.error && keyInput.current) keyInput.current.value = "";
  }, [result]);

  return <main className="veyro ai-settings" aria-busy={busy}>
    <header className="v-header"><div><div className="v-eyebrow">VEYRO / AI SETTINGS</div><h1>Your store. Your AI connection.</h1><p>Connect OpenAI here to analyze product images and power your automation.</p></div><Link className="v-button v-secondary" to={`/app/automation${location.search}`}>Back to automation</Link></header>
    {result?.error && <div className="v-notice v-error" role="alert">{result.error}</div>}
    {result?.message && !result?.error && <div className="v-notice" role="status">{result.message}</div>}
    {busy && <p className="v-processing" role="status">{navigation.formData?.get("intent") === "disconnect" ? "Disconnecting AI…" : "Saving AI settings…"}</p>}
    <div className="ai-settings-layout">
      <section className="v-panel v-settings ai-connection" aria-labelledby="ai-connection-title">
        <div className="ai-connection-heading"><div><div className="v-eyebrow">OPENAI CONNECTION</div><h2 id="ai-connection-title">Image analysis</h2></div><span className={`v-status ${configured ? "" : "ai-status-incomplete"}`}>{configured ? "Configured" : "Setup needed"}</span></div>
        <p className="ai-key-status"><span className="v-dot" aria-hidden="true" />{hasKey ? "An API key is saved for this store." : "No API key saved for this store."}</p>
        <Form method="post" autoComplete="off">
          <input type="hidden" name="intent" value="save" />
          <label htmlFor="ai-api-key">{hasKey ? "Replace API key" : "OpenAI API key"}</label>
          <input ref={keyInput} id="ai-api-key" name="apiKey" type="password" autoComplete="new-password" spellCheck={false} autoCapitalize="none" required={!hasKey} aria-describedby="ai-api-key-help" placeholder={hasKey ? "Leave blank to keep your saved key" : "Enter your OpenAI API key"} disabled={busy} />
          <p id="ai-api-key-help" className="v-help">Your key is encrypted when stored and is never displayed. {hasKey && "Leave this field blank to keep the current key."}</p>
          <label htmlFor="ai-model">Vision model</label>
          <input id="ai-model" key={model || "empty-model"} name="model" type="text" defaultValue={model || ""} required maxLength={120} autoComplete="off" spellCheck={false} autoCapitalize="none" placeholder="Enter a vision-capable model ID" aria-describedby="ai-model-help" disabled={busy} />
          <p id="ai-model-help" className="v-help">Use the exact model ID available to your OpenAI project. It must support image input. Saving these settings does not test the connection.</p>
          <button type="submit" className="v-button" disabled={busy}>Save AI settings</button>
        </Form>
      </section>
      <aside className="v-guide ai-settings-guide"><div className="v-eyebrow">SET UP ONCE, USE ACROSS VEYRO</div><h2>A connection for your store.</h2><ol><li><span>01</span><div><strong>Add your API key</strong><p>Use an API key from your OpenAI project. OpenAI usage is billed to your OpenAI account.</p></div></li><li><span>02</span><div><strong>Choose your vision model</strong><p>The same connection is used for manual image analysis and background image processing.</p></div></li><li><span>03</span><div><strong>Choose your automation rules</strong><p>After saving, return to Automation to choose when images are processed and published.</p></div></li></ol><p className="v-guide-foot">These settings apply only to this Shopify store. You can update your key or model here at any time.</p></aside>
    </div>
    {hasKey && <section className="v-panel ai-disconnect" aria-labelledby="ai-disconnect-title"><div><h2 id="ai-disconnect-title">Disconnect OpenAI</h2><p>Remove this store’s saved API key. Image analysis will need a new connection before it can run again.</p></div><Form method="post"><input type="hidden" name="intent" value="disconnect" /><button type="submit" className="v-button v-secondary" disabled={busy}>Disconnect AI</button></Form></section>}
  </main>;
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
