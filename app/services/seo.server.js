import prisma from "../db.server.js";
import { auditProducts, suggestMetadata, validateMetadata } from "./seo.js";

const FIELDS = `id title handle description seo { title description }
  media(first: 20) { nodes { mediaContentType alt } pageInfo { hasNextPage } }`;
const PRODUCT_ID = /^gid:\/\/shopify\/Product\/\d+$/;

async function graphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((error) => error.message).join("; ") || "Shopify request failed.");
  if (!body.data) throw new Error("Shopify returned no data.");
  return body.data;
}

function productView(product) {
  const images = product.media.nodes.filter((media) => media.mediaContentType === "IMAGE");
  return { id: product.id, title: product.title, handle: product.handle, description: product.description,
    seo: { title: product.seo?.title || "", description: product.seo?.description || "" },
    imageCount: images.length, missingAltCount: images.filter((media) => !media.alt?.trim()).length,
    mediaTruncated: product.media.pageInfo.hasNextPage };
}

export async function loadSeoDashboard({ admin, shop, request, db = prisma }) {
  const result = { products: [], drafts: [], pageInfo: { hasNextPage: false, endCursor: null }, storeUrl: "" };
  try {
    const active = await db.seoDraft.findMany({ where: { shop, status: { in: ["pending", "applying"] } }, orderBy: { createdAt: "asc" }, take: 50 });
    const history = active.length < 50 ? await db.seoDraft.findMany({ where: { shop, status: { in: ["applied", "dismissed"] } }, orderBy: { updatedAt: "desc" }, take: 50 - active.length }) : [];
    result.drafts = [...active, ...history];
    const after = new URL(request.url).searchParams.get("after") || null;
    if (after && after.length > 1024) throw new Error("Invalid product page cursor. Return to the first page.");
    const data = await graphql(admin, `query VeyroSeoProducts($after: String) {
      shop { primaryDomain { url } }
      products(first: 20, after: $after, sortKey: ID) { nodes { ${FIELDS} } pageInfo { hasNextPage endCursor } }
    }`, { after });
    result.products = auditProducts(data.products.nodes.map(productView));
    result.pageInfo = data.products.pageInfo;
    result.storeUrl = data.shop.primaryDomain.url;
  } catch (error) { result.error = error.message; }
  return result;
}

export async function handleSeoAction({ admin, shop, formData, db = prisma }) {
  try {
    const intent = formData.get("intent");
    if (intent === "draft") {
      const ids = [...new Set(formData.getAll("productIds").map(String))];
      if (!ids.length || ids.length > 20 || ids.some((id) => !PRODUCT_ID.test(id))) throw new Error("Select between 1 and 20 products.");
      const data = await graphql(admin, `query VeyroSeoSelection($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { ${FIELDS} } } }`, { ids });
      const rows = [];
      for (const product of data.nodes.filter(Boolean)) {
        if (!product.id || !ids.includes(product.id)) continue;
        const view = productView(product);
        const suggested = suggestMetadata(view);
        rows.push({ shop, productId: product.id, activeProductId: product.id, productTitle: product.title, handle: product.handle,
          originalTitle: view.seo.title, originalDescription: view.seo.description,
          title: suggested.suggestedTitle, description: suggested.suggestedDescription });
      }
      let created = 0;
      for (const row of rows) {
        try { await db.seoDraft.create({ data: row }); created++; }
        catch (error) { if (error.code !== "P2002") throw error; }
      }
      return { success: true, message: `${created} SEO draft${created === 1 ? "" : "s"} prepared. ${ids.length - created} skipped (already pending or unavailable). Review each draft before publishing.` };
    }
    if (!["save", "dismiss", "reconcile"].includes(intent)) throw new Error("Unknown SEO action.");
    const id = String(formData.get("draftId") || "");
    const draft = await db.seoDraft.findFirst({ where: { id, shop } });
    if (!draft) throw new Error("SEO draft not found.");
    if (intent === "reconcile") {
      if (draft.status !== "applying") throw new Error("This draft does not need reconciliation.");
      // Allow the original request time to finish before checking an interrupted write.
      if (Date.now() - new Date(draft.updatedAt).getTime() < 120000) throw new Error("Publishing is still in progress. Wait two minutes before checking again.");
      const current = await readSeo(admin, draft.productId);
      const matches = sameSeo(current, draft.title, draft.description);
      await db.seoDraft.updateMany({ where: { id, shop, status: "applying", updatedAt: draft.updatedAt }, data: {
        status: matches ? "applied" : "pending", activeProductId: matches ? null : draft.productId,
        error: matches ? null : "Shopify differs from this draft. Review before retrying; dismiss and prepare a fresh draft if the metadata changed.",
      } });
      return { success: true, message: matches ? "Shopify confirms this SEO update was applied." : "Draft returned to review. No Shopify changes were made." };
    }
    if (draft.status !== "pending") throw new Error("This draft is no longer awaiting review.");
    if (intent === "dismiss") {
      const changed = await db.seoDraft.updateMany({ where: { id, shop, status: "pending" }, data: { status: "dismissed", activeProductId: null } });
      if (!changed.count) throw new Error("This draft is already being processed.");
      return { success: true, message: "SEO draft dismissed. Shopify was not changed." };
    }
    const metadata = validateMetadata(formData);
    const claim = await db.seoDraft.updateMany({ where: { id, shop, status: "pending" }, data: { status: "applying", ...metadata, error: null } });
    if (!claim.count) throw new Error("This draft is already being processed.");
    let writeStarted = false;
    try {
      const current = await readSeo(admin, draft.productId);
      if (!sameSeo(current, draft.originalTitle, draft.originalDescription) && !sameSeo(current, metadata.title, metadata.description)) {
        throw new Error("SEO changed in Shopify after this draft was created. Dismiss this draft and prepare a new one to keep the latest edits.");
      }
      if (!sameSeo(current, metadata.title, metadata.description)) {
        writeStarted = true;
        const data = await graphql(admin, `mutation VeyroSaveSeo($product: ProductUpdateInput!) {
          productUpdate(product: $product) { product { id seo { title description } } userErrors { field message } }
        }`, { product: { id: draft.productId, seo: metadata } });
        if (data.productUpdate.userErrors.length) {
          writeStarted = false;
          throw new Error(data.productUpdate.userErrors.map((error) => error.message).join("; "));
        }
        if (data.productUpdate.product?.id !== draft.productId || !sameSeo(data.productUpdate.product.seo, metadata.title, metadata.description)) throw new Error("Shopify did not confirm the requested SEO metadata. Check the update status before retrying.");
      }
      await db.seoDraft.updateMany({ where: { id, shop, status: "applying" }, data: { status: "applied", activeProductId: null, error: null } });
    } catch (error) {
      // Network errors after a mutation have an unknown outcome; preserve the attempt for reconciliation.
      await db.seoDraft.updateMany({ where: { id, shop, status: "applying" }, data: { status: writeStarted ? "applying" : "pending", error: error.message } });
      throw error;
    }
    return { success: true, message: "Search title and description updated in Shopify." };
  } catch (error) { return { success: false, error: error.message || "The SEO action failed. Try again." }; }
}

async function readSeo(admin, id) {
  const data = await graphql(admin, `query VeyroCurrentSeo($id: ID!) { product(id: $id) { id seo { title description } } }`, { id });
  if (!data.product) throw new Error("This product is no longer available.");
  return data.product.seo;
}

function sameSeo(seo, title, description) {
  return (seo?.title || "") === title && (seo?.description || "") === description;
}
