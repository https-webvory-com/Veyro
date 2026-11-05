import { useFetcher } from "react-router";

const PLATFORMS = [
  { id: "ga4", label: "Google Analytics 4" },
  { id: "ads", label: "Google Ads" },
  { id: "gtm", label: "Google Tag Manager" },
];

/* eslint-disable-next-line react/prop-types */
export function GoogleConnections({ connected, configured }) {
  const fetcher = useFetcher();
  const busyPlatform = fetcher.state === "idle" ? null : fetcher.formData?.get("platform");
  const busyIntent = fetcher.formData?.get("intent");

  const send = (intent, platform) =>
    fetcher.submit({ intent, platform }, { method: "post", action: "/app/tracking/integrations" });

  return (
    <s-stack direction="block" gap="base">
      {!configured && (
        <s-banner tone="warning" heading="Add your Google credentials first">
          <s-paragraph>
            Save the Google client ID and client secret for this store on the{" "}
            <s-link href="/app/tracking/integrations">Integrations page</s-link> to connect these services.
          </s-paragraph>
        </s-banner>
      )}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}
      {PLATFORMS.map(({ id, label }) => {
        const isConnected = Boolean(connected[id]);
        return (
          <s-stack key={id} direction="inline" gap="base" alignItems="center" justifyContent="space-between">
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <strong>{label}</strong>
              <s-badge tone={isConnected ? "success" : "critical"}>
                {isConnected ? "Connected" : "Not connected"}
              </s-badge>
            </s-stack>
            <s-stack direction="inline" gap="small-200">
              {isConnected && (
                <s-button
                  tone="critical"
                  onClick={() => send("disconnect", id)}
                  {...(busyPlatform === id && busyIntent === "disconnect" ? { loading: true } : {})}
                  {...(busyPlatform ? { disabled: true } : {})}
                >
                  Disconnect
                </s-button>
              )}
              <s-button
                {...(isConnected ? {} : { variant: "primary" })}
                onClick={() => send("connect", id)}
                {...(busyPlatform === id && busyIntent === "connect" ? { loading: true } : {})}
                {...(!configured || busyPlatform ? { disabled: true } : {})}
              >
                {isConnected ? "Reconnect" : "Connect"}
              </s-button>
            </s-stack>
          </s-stack>
        );
      })}
    </s-stack>
  );
}
