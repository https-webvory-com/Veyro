import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { detectDuplicatePurchases } from "../services/duplicates.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const duplicates = await detectDuplicatePurchases(session.shop);
  return { duplicates };
};

export default function DuplicatesPage() {
  const { duplicates } = useLoaderData();

  return (
    <s-page heading="Duplicate Purchase Detection">
      <s-section heading={`Potential Duplicates (${duplicates.length})`}>
        {duplicates.length === 0 ? (
          <s-paragraph>No duplicate purchase events detected.</s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {duplicates.map((d) => (
              <div key={d.key}>
                <strong>Order/Tx: {d.key}</strong> — {d.count} events — Destinations: {d.destinations.join(", ")}
              </div>
            ))}
          </s-stack>
        )}
      </s-section>
      <s-section heading="How it works">
        <s-paragraph>
          Groups purchase events by Shopify order ID or transaction ID.
          Multiple events for the same order are flagged as potential duplicates.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);