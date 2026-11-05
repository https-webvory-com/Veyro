import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { validateTransactionIds } from "../services/transaction-id.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const issues = await validateTransactionIds(session.shop);
  return { issues };
};

export default function TransactionIdsPage() {
  const { issues } = useLoaderData();

  return (
    <s-page heading="Transaction ID Validator">
      <s-section heading={`Issues Found (${issues.length})`}>
        {issues.length === 0 ? (
          <s-paragraph>All purchase events have valid transaction IDs.</s-paragraph>
        ) : (
          issues.map((i) => (
            <div key={i.id}>
              {i.transactionId || "(empty)"} — {i.issues.join(", ")}
            </div>
          ))
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);