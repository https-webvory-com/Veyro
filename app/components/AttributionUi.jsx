/* eslint-disable react/prop-types */

export function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency || ""} ${Number(value || 0).toFixed(2)}`.trim();
  }
}

export function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export const percent = (share) => `${Math.round((share || 0) * 100)}%`;

// One headline number with a short explanation underneath.
export function StatTile({ label, value, detail, tone }) {
  return (
    <s-box padding="base" borderWidth="base" borderColor="base" borderRadius="base">
      <s-stack direction="block" gap="small-300">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{tone ? <s-text tone={tone}>{value}</s-text> : value}</s-heading>
        {detail && <s-text color="subdued">{detail}</s-text>}
      </s-stack>
    </s-box>
  );
}

// A horizontal bar showing a share of the total, with the percentage beside it.
export function ShareBar({ share }) {
  const width = Math.max(0, Math.min(100, Math.round((share || 0) * 100)));
  return (
    <s-stack direction="inline" gap="small-200" alignItems="center">
      <div
        role="presentation"
        style={{ inlineSize: "96px", blockSize: "8px", borderRadius: "4px", background: "#e3e3e3", overflow: "hidden" }}
      >
        <div style={{ inlineSize: `${width}%`, blockSize: "100%", borderRadius: "4px", background: "#303030" }} />
      </div>
      <s-text>{width}%</s-text>
    </s-stack>
  );
}
