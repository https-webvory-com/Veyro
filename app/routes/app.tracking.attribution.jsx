import { useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  createChannelRule,
  getAttributionSettings,
  listChannelRules,
  reapplyAttribution,
  setDefaultModel,
  updateChannelRule,
} from "../services/attribution.server";
import { CHANNEL_GROUPS, CHANNELS, MODELS, RULE_FIELDS, RULE_OPERATORS, channelInfo } from "../services/channels";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [settings, rules] = await Promise.all([getAttributionSettings(session.shop), listChannelRules(session.shop)]);
  return { ...settings, rules };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const shop = session.shop;
  switch (formData.get("intent")) {
    case "model":
      return setDefaultModel(shop, String(formData.get("defaultModel") || ""));
    case "addRule":
      return createChannelRule(shop, Object.fromEntries(formData));
    case "rule":
      return updateChannelRule(shop, formData.get("id"), formData.get("action"));
    case "reapply": {
      const count = await reapplyAttribution(shop);
      return { message: `Rechecked ${count} order${count === 1 ? "" : "s"} with your current rules.` };
    }
    default:
      return { error: "Unknown action." };
  }
};

// Polaris fields take part in forms; reading the element too covers browsers where they don't.
function readFields(form, names) {
  const data = new FormData(form);
  return Object.fromEntries(names.map((name) => {
    const element = form.querySelector(`[name="${name}"]`);
    const value = data.get(name) ?? element?.value ?? element?.values?.[0] ?? "";
    return [name, String(value)];
  }));
}

const CHANNEL_OPTIONS = Object.entries(CHANNEL_GROUPS).map(([group, info]) => ({
  group,
  label: info.label,
  channels: Object.entries(CHANNELS).filter(([key, ch]) => ch.group === group && key !== "unknown"),
}));

const BUILT_IN = [
  ["Google Ads click ID (gclid, gbraid, wbraid)", "Google Ads (YouTube Ads when utm_source is youtube)"],
  ["Microsoft Ads click ID (msclkid)", "Microsoft Ads"],
  ["TikTok, Snapchat, Pinterest, LinkedIn click IDs (ttclid, ScCid, epik, li_fat_id)", "That network's ads"],
  ["AWIN click ID (awc); Impact, CJ, ShareASale IDs (irclickid, cjevent, sscid)", "AWIN; Other affiliate"],
  ["utm_medium=cpc or paid, with utm_source google, facebook, instagram, tiktok, and so on", "That network's ads"],
  ["utm_medium=email (source klaviyo, omnisend, or shopify)", "Klaviyo, Omnisend, Shopify Email, or Other email"],
  ["utm_medium=sms", "Klaviyo SMS, Omnisend SMS, or Other SMS"],
  ["utm_medium=affiliate, influencer, qr, or print", "Affiliate, Influencer, QR code, or Offline campaign"],
  ["Klaviyo link parameter (_kx)", "Klaviyo email"],
  ["Referring website: Google, Bing, Yahoo, DuckDuckGo", "Organic search"],
  ["Referring website: Facebook, Instagram, Pinterest, TikTok, YouTube, X, LinkedIn", "Organic social"],
  ["Referring website: webmail such as Gmail or Outlook", "Other email"],
  ["Any other referring website", "Referral site"],
  ["No referrer and no tags", "Direct"],
  ["Point of sale and draft orders", "Point of sale; Draft order"],
];

export default function AttributionSettingsPage() {
  const { defaultModel, rules } = useLoaderData();
  const fetcher = useFetcher();
  const busy = fetcher.state !== "idle";
  const ruleForm = useRef(null);

  const submit = (data) => fetcher.submit(data, { method: "post" });

  const saveModel = (event) => {
    event.preventDefault();
    submit({ intent: "model", ...readFields(event.currentTarget, ["defaultModel"]) });
  };

  const addRule = (event) => {
    event.preventDefault();
    submit({ intent: "addRule", ...readFields(event.currentTarget, ["field", "operator", "value", "channel", "name"]) });
    ruleForm.current?.reset();
  };

  return (
    <s-page heading="Attribution settings" inlineSize="base">
      <s-link slot="breadcrumb-actions" href="/app/tracking/orders">Order sources</s-link>
      {fetcher.data?.message && <s-banner tone="success">{fetcher.data.message}</s-banner>}
      {fetcher.data?.error && <s-banner tone="critical">{fetcher.data.error}</s-banner>}

      <s-section heading="Which visit gets the credit">
        <form data-save-bar onSubmit={saveModel} key={defaultModel}>
          <s-choice-list
            label="Default credit model"
            name="defaultModel"
            details="Used on every report and dashboard. You can still compare models on the Order sources page."
          >
            {Object.entries(MODELS).map(([key, model]) => (
              <s-choice key={key} value={key} defaultSelected={key === defaultModel || undefined} details={model.description}>
                {model.label}
              </s-choice>
            ))}
          </s-choice-list>
        </form>
      </s-section>

      <s-section heading="Your channel rules">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Rules are checked from top to bottom, before Veyro&apos;s built-in detection. Use them for sources Veyro
            can&apos;t recognise, such as a partner&apos;s campaign tag or an influencer&apos;s code.
          </s-paragraph>

          {rules.length === 0 ? (
            <s-box padding="base" borderWidth="base" borderColor="base" borderRadius="base">
              <s-text color="subdued">No rules yet. Built-in detection is handling every order.</s-text>
            </s-box>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header listSlot="primary">Rule</s-table-header>
                <s-table-header listSlot="secondary">Credit to</s-table-header>
                <s-table-header listSlot="inline">Status</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {rules.map((rule, index) => (
                  <s-table-row key={rule.id}>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-500">
                        <s-text type="strong">{rule.name}</s-text>
                        <s-text color="subdued">
                          When {RULE_FIELDS[rule.field]?.toLowerCase()} {RULE_OPERATORS[rule.operator]} &quot;{rule.value}&quot;
                        </s-text>
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>{channelInfo(rule.channel).label}</s-table-cell>
                    <s-table-cell>
                      <s-badge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "On" : "Off"}</s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      <s-stack direction="inline" gap="small-200">
                        <s-button variant="tertiary" disabled={busy || index === 0 || undefined} accessibilityLabel={`Move ${rule.name} up`} onClick={() => submit({ intent: "rule", id: rule.id, action: "up" })}>Move up</s-button>
                        <s-button variant="tertiary" disabled={busy || index === rules.length - 1 || undefined} accessibilityLabel={`Move ${rule.name} down`} onClick={() => submit({ intent: "rule", id: rule.id, action: "down" })}>Move down</s-button>
                        <s-button variant="tertiary" disabled={busy || undefined} onClick={() => submit({ intent: "rule", id: rule.id, action: "toggle" })}>{rule.enabled ? "Turn off" : "Turn on"}</s-button>
                        <s-button variant="tertiary" tone="critical" disabled={busy || undefined} onClick={() => submit({ intent: "rule", id: rule.id, action: "delete" })}>Delete</s-button>
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}

          <s-box padding="base" borderWidth="base" borderColor="base" borderRadius="base">
            <form ref={ruleForm} onSubmit={addRule}>
              <s-stack direction="block" gap="base">
                <s-heading>Add a rule</s-heading>
                <s-grid gridTemplateColumns="repeat(auto-fit, minmax(160px, 1fr))" gap="base">
                  <s-select label="When" name="field" value="utm_source">
                    {Object.entries(RULE_FIELDS).map(([key, label]) => <s-option key={key} value={key}>{label}</s-option>)}
                  </s-select>
                  <s-select label="Match" name="operator" value="contains">
                    {Object.entries(RULE_OPERATORS).map(([key, label]) => <s-option key={key} value={key}>{label}</s-option>)}
                  </s-select>
                  <s-text-field label="Value" name="value" placeholder="for example: partnerx" required maxLength={200} />
                  <s-select label="Credit to" name="channel" placeholder="Choose a channel">
                    {CHANNEL_OPTIONS.map((g) => (
                      <s-option-group key={g.group} label={g.label}>
                        {g.channels.map(([key, ch]) => <s-option key={key} value={key}>{ch.label}</s-option>)}
                      </s-option-group>
                    ))}
                  </s-select>
                </s-grid>
                <s-text-field label="Rule name (optional)" name="name" placeholder="for example: Partner X newsletter" maxLength={80} />
                <s-stack direction="inline" gap="base" alignItems="center">
                  <s-button type="submit" variant="primary" loading={(busy && fetcher.formData?.get("intent") === "addRule") || undefined}>Add rule</s-button>
                  <s-text color="subdued">Matching ignores capital letters. Stored orders are rechecked straight away.</s-text>
                </s-stack>
              </s-stack>
            </form>
          </s-box>
        </s-stack>
      </s-section>

      <s-section heading="What Veyro recognises automatically">
        <s-table>
          <s-table-header-row>
            <s-table-header listSlot="primary">When an order&apos;s visit has</s-table-header>
            <s-table-header listSlot="secondary">It&apos;s credited to</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {BUILT_IN.map(([signal, channel]) => (
              <s-table-row key={signal}>
                <s-table-cell>{signal}</s-table-cell>
                <s-table-cell>{channel}</s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
      </s-section>

      <s-section heading="Recheck stored orders">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Applies your current rules and credit model to every order Veyro has stored. Rule changes already do this
            automatically; use it if something looks out of date.
          </s-paragraph>
          <s-stack direction="inline">
            <s-button disabled={busy || undefined} loading={(busy && fetcher.formData?.get("intent") === "reapply") || undefined} onClick={() => submit({ intent: "reapply" })}>
              Recheck orders
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
