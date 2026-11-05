import { useEffect, useState } from "react";
import { useFetcher } from "react-router";

const INPUT_STYLE = { display: "block", width: "100%", boxSizing: "border-box", padding: "8px", marginTop: "4px", border: "1px solid #8c9196", borderRadius: "8px", font: "inherit" };

/* eslint-disable react/prop-types */
export function GoogleCredentialsForm({ clientId: savedClientId, configured, redirectUri }) {
  /* eslint-enable react/prop-types */
  const fetcher = useFetcher();
  const [clientId, setClientId] = useState(savedClientId);
  const [clientSecret, setClientSecret] = useState("");
  const busy = fetcher.state !== "idle";
  const message = fetcher.data?.message;

  // Drop the typed secret once the server has saved it, and follow the saved client ID.
  useEffect(() => {
    if (message) setClientSecret("");
  }, [message]);
  useEffect(() => setClientId(savedClientId), [savedClientId]);

  const send = (intent) =>
    fetcher.submit({ intent, clientId, clientSecret }, { method: "post", action: "/app/tracking/integrations" });

  return (
    <s-stack direction="block" gap="base">
      {message && <s-banner tone="success">{message}</s-banner>}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
      <s-paragraph>
        Each store uses its own Google Cloud OAuth client. In your Google Cloud project, create a &quot;Web
        application&quot; OAuth client and add this Authorized redirect URI:
      </s-paragraph>
      <code style={{ wordBreak: "break-all" }}>{redirectUri}</code>
      <label>
        Client ID
        <input
          style={INPUT_STYLE}
          type="text"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="1234567890-abc.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          maxLength={300}
        />
      </label>
      <label>
        {configured ? "Replace client secret" : "Client secret"}
        <input
          style={INPUT_STYLE}
          type="password"
          value={clientSecret}
          onChange={(event) => setClientSecret(event.target.value)}
          placeholder={configured ? "Leave blank to keep the saved secret" : ""}
          autoComplete="new-password"
          spellCheck={false}
          maxLength={512}
        />
      </label>
      <s-paragraph>
        Your secret is encrypted when stored and is never displayed. Changing the client ID disconnects your Google services.
      </s-paragraph>
      <s-stack direction="inline" gap="small-200">
        <s-button variant="primary" onClick={() => send("save-credentials")} {...(busy ? { disabled: true } : {})}>
          Save credentials
        </s-button>
        {configured && (
          <s-button tone="critical" onClick={() => send("remove-credentials")} {...(busy ? { disabled: true } : {})}>
            Remove credentials
          </s-button>
        )}
      </s-stack>
    </s-stack>
  );
}
