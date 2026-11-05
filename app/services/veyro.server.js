import { loadAiSettings } from "./ai-settings.server.js";
import prisma from "../db.server.js";
import { DEFAULT_TEMPLATE, generateAlt, matchColor, validateSettings } from "./alt.js";
import { analyzeImage } from "./vision.server.js";
import { assignMatchingVariants } from "./variants.server.js";

const PRODUCT_FIELDS = `id title productType category { name } options { name values }
  media(first: 20) { nodes { id alt ... on MediaImage { image { url } } } }`;

async function graphql(admin, query, variables = {}) {
  const response = await admin.graphql(query, { variables });
  const body = await response.json();
  if (!response.ok || body.errors?.length) throw new Error(body.errors?.map((e) => e.message).join("; ") || "Shopify request failed.");
  if (!body.data) throw new Error("Shopify returned no data.");
  return body.data;
}

function productView(product) {
  return {
    id: product.id, title: product.title, category: product.category?.name || product.productType || "",
    colors: product.options.filter((option) => /^(color|colour)$/i.test(option.name)).flatMap((option) => option.values),
    images: product.media.nodes.filter((media) => media.image?.url).map((media) => ({ id: media.id, url: media.image.url, alt: media.alt || "" })),
  };
}

export async function loadDashboard({ admin, shop }) {
  const db = prisma;
  const [settings, active] = await Promise.all([
    db.imageSettings.findUnique({ where: { shop } }),
    db.imageReview.findMany({ where: { shop, status: { in: ["pending", "applying"] } }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  const history = active.length < 100 ? await db.imageReview.findMany({ where: { shop, status: { in: ["applied", "dismissed"] } }, orderBy: { updatedAt: "desc" }, take: 100 - active.length }) : [];
  const reviews = [...active, ...history];
  const result = { settings: settings || { altTemplate: DEFAULT_TEMPLATE, confidenceThreshold: 95 }, reviews,
    configured: (await loadAiSettings(shop, db)).configured, products: [] };
  try {
    const data = await graphql(admin, `query VeyroProducts { products(first: 20, sortKey: UPDATED_AT, reverse: true) { nodes { ${PRODUCT_FIELDS} } } }`);
    result.products = data.products.nodes.map(productView);
  } catch (error) { result.error = error.message; }
  return result;
}

export async function handleDashboardAction({ admin, shop, formData, db = prisma, source = "manual", assertActive = async () => {} }) {
  try {
    const intent = formData.get("intent");
    if (intent === "settings") {
      const settings = validateSettings(formData);
      if (settings.confidenceThreshold < 95 && (await db.imageSettings.findUnique({ where: { shop } }))?.autoApprove) throw new Error("Automatic approval is enabled. Keep its threshold at least 95%, or turn it off in Automation first.");
      await db.imageSettings.upsert({ where: { shop }, create: { shop, ...settings }, update: settings });
      return { success: true, message: "Settings saved. They apply to new suggestions." };
    }
    if (intent === "analyze") {
      const productId = String(formData.get("productId") || "");
      if (!/^gid:\/\/shopify\/Product\/\d+$/.test(productId)) throw new Error("Choose a valid product.");
      const data = await graphql(admin, `query VeyroProduct($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`, { id: productId });
      if (!data.product) throw new Error("This product is no longer available.");
      const product = productView(data.product);
      const existing = await db.imageReview.findMany({ where: { shop, productId }, select: { mediaId: true } });
      const image = product.images.find((item) => !existing.some((review) => review.mediaId === item.id));
      if (!image) throw new Error("All images in this product's first 20 media items have been reviewed or analyzed.");
      const settings = await db.imageSettings.findUnique({ where: { shop } });
      const analysis = await analyzeImage(image.url, product.colors, { shop, db });
      const matchedColor = matchColor(analysis.color, product.colors);
      const generatedAlt = generateAlt(settings?.altTemplate || DEFAULT_TEMPLATE, {
        title: product.title, category: product.category,
        color: analysis.color.toLowerCase() === "unknown" ? "" : matchedColor || analysis.color,
      });
      await db.imageReview.create({ data: { shop, productId, productTitle: product.title, mediaId: image.id,
        imageUrl: image.url, originalAlt: image.alt, generatedAlt, detectedColor: analysis.color,
        matchedColor, confidence: analysis.confidence } });
      return { success: true, message: "Image analyzed. Review the ALT suggestion before applying it." };
    }
    if (intent === "approve" || intent === "dismiss") {
      const id = String(formData.get("reviewId") || "");
      const review = await db.imageReview.findFirst({ where: { id, shop } });
      if (!review || review.status !== "pending") throw new Error("This suggestion is no longer awaiting review.");
      if (intent === "dismiss") {
        await db.imageReview.updateMany({ where: { id, shop, status: "pending" }, data: { status: "dismissed" } });
        return { success: true, message: "Suggestion dismissed. Shopify was not changed." };
      }
      const alt = String(formData.get("generatedAlt") ?? review.generatedAlt).replace(/\s+/g, " ").trim();
      if (!alt || alt.length > 512) throw new Error("ALT text must be between 1 and 512 characters.");
      const assignVariants = formData.get("assignVariants") === "on";
      if (assignVariants && (!review.matchedColor || review.confidence < 70)) throw new Error("Variant assignment requires a matched color and at least 70% confidence.");
      // Claim the review so parallel submissions cannot apply different edits.
      const claim = await db.imageReview.updateMany({ where: { id, shop, status: "pending" }, data: { status: "applying" } });
      if (!claim.count) throw new Error("This suggestion is already being processed.");
      try {
        await assertActive();
        const current = await graphql(admin, `query VeyroCurrentAlt($id: ID!) { node(id: $id) { ... on MediaImage { id alt fileStatus } } }`, { id: review.mediaId });
        if (!current.node?.id) throw new Error("The image no longer exists.");
        if (current.node.fileStatus !== "READY") throw new Error("Shopify is still processing this image. Try again later.");
        if ((current.node.alt || "") !== review.originalAlt && current.node.alt !== alt) throw new Error("ALT text changed in Shopify since analysis. Refresh and review the current image in Shopify before updating it.");
        if (current.node.alt !== alt) {
          await assertActive();
          const updated = await graphql(admin, `mutation VeyroUpdateAlt($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id alt } userErrors { field message } } }`, { files: [{ id: review.mediaId, alt }] });
          if (updated.fileUpdate.userErrors.length) throw new Error(updated.fileUpdate.userErrors.map((error) => error.message).join("; "));
          if (!updated.fileUpdate.files?.some((file) => file.id === review.mediaId)) throw new Error("Shopify did not confirm the image update.");
        }
        if (assignVariants) {
          const count = await assignMatchingVariants({ admin, review, assertActive });
          await db.imageReview.updateMany({ where: { id, shop }, data: { variantStatus: `${count} empty variants assigned` } });
        }
        if (db.imageChange) await db.imageChange.create({ data: { shop, mediaId: review.mediaId, previousAlt: review.originalAlt, appliedAlt: alt, source } });
        await db.imageReview.updateMany({ where: { id, shop }, data: { status: "applied", generatedAlt: alt, error: null } });
      } catch (error) {
        await db.imageReview.updateMany({ where: { id, shop }, data: { status: "pending", error: error.message } });
        throw error;
      }
      return { success: true, message: "ALT text updated in Shopify." };
    }
    throw new Error("Unknown action.");
  } catch (error) {
    if (error.code === "P2002") return { success: false, error: "This image was already analyzed in another request. Refresh to see its suggestion." };
    return { success: false, error: error.message || "Something went wrong. Try again." };
  }
}
