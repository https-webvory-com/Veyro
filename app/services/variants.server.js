import { graphql, checkUserErrors } from "./shopify-api.server.js";
import { matchColor } from "./alt.js";

export function matchingEmptyVariants(variants, color) {
  return variants.filter((variant) => !variant.media.nodes.length && variant.selectedOptions.some((option) => /^(color|colour)$/i.test(option.name) && matchColor(option.value, [color])));
}

export async function assignMatchingVariants({ admin, review, assertActive = async () => {} }) {
  if (!review.matchedColor || review.confidence < 70) throw new Error("Variant assignment requires a matched color and at least 70% confidence.");
  let after = null; let assigned = 0;
  // The media ID must still belong to this product before assigning any variant.
  let mediaAfter = null; let belongs = false;
  do {
    const data = await graphql(admin, `query VeyroProductMedia($id: ID!, $after: String) { product(id: $id) { media(first: 100, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } } }`, { id: review.productId, after: mediaAfter });
    if (!data.product) throw new Error("Product no longer exists.");
    belongs = data.product.media.nodes.some((media) => media.id === review.mediaId);
    mediaAfter = data.product.media.pageInfo.hasNextPage ? data.product.media.pageInfo.endCursor : null;
  } while (!belongs && mediaAfter);
  if (!belongs) throw new Error("This image no longer belongs to the product.");
  do {
    await assertActive();
    const data = await graphql(admin, `query VeyroColorVariants($id: ID!, $after: String) { product(id: $id) { variants(first: 100, after: $after) { nodes { id selectedOptions { name value } media(first: 1) { nodes { id } } } pageInfo { hasNextPage endCursor } } } }`, { id: review.productId, after });
    if (!data.product) throw new Error("Product no longer exists.");
    const matches = matchingEmptyVariants(data.product.variants.nodes, review.matchedColor);
    if (matches.length) {
      await assertActive();
      const updated = await graphql(admin, `mutation VeyroAssignVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants, allowPartialUpdates: false) { productVariants { id } userErrors { field message } } }`, {
        productId: review.productId, variants: matches.map((variant) => ({ id: variant.id, mediaId: review.mediaId })),
      });
      const result = checkUserErrors(updated.productVariantsBulkUpdate);
      if (result.productVariants?.length !== matches.length) throw new Error("Shopify did not confirm all variant updates. Retry to check remaining variants.");
      assigned += matches.length;
    }
    after = data.product.variants.pageInfo.hasNextPage ? data.product.variants.pageInfo.endCursor : null;
  } while (after);
  return assigned;
}
