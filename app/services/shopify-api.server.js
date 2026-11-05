export async function graphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((error) => error.message).join("; ") || "Shopify request failed.");
  if (!body.data) throw new Error("Shopify returned no data.");
  return body.data;
}

export function checkUserErrors(payload) {
  if (!payload) throw new Error("Shopify returned no mutation result.");
  if (payload.userErrors?.length) throw new Error(payload.userErrors.map((error) => error.message).join("; "));
  return payload;
}
