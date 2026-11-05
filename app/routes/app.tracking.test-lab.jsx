import { useLoaderData, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const tests = await db.auditIssue.findMany({
    where: { shop: session.shop, category: "test-lab" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return { tests };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const note = formData.get("note");

  await db.auditIssue.create({
    data: {
      shop: session.shop,
      severity: "low",
      category: "test-lab",
      title: "Manual test result",
      description: note || "Test recorded",
      status: "open",
    },
  });

  return { ok: true };
};

export default function TestLabPage() {
  const { tests } = useLoaderData();

  return (
    <s-page heading="End-to-End Tracking Test Lab">
      <s-section heading="Record a test">
        <Form method="post">
          <s-text-field name="note" label="Test notes" />
          <s-button type="submit">Save test result</s-button>
        </Form>
      </s-section>
      <s-section heading="Recent tests">
        {tests.map((t) => (
          <div key={t.id}>{t.description} — {t.createdAt}</div>
        ))}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);