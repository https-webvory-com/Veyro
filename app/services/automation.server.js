import { createHash } from "node:crypto";
import prisma from "../db.server.js";
import { validateSettings, generateAlt, matchColor, DEFAULT_TEMPLATE } from "./alt.js";
import { graphql } from "./shopify-api.server.js";
import { analyzeImage } from "./vision.server.js";
import { enqueue } from "./queue.server.js";
import { handleDashboardAction } from "./veyro.server.js";

import { loadAiSettings } from "./ai-settings.server.js";
export async function loadAutomation({ shop, db = prisma }) {
  const [settings, jobs, worker] = await Promise.all([
    db.imageSettings.findUnique({ where: { shop } }),
    db.workJob.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.workerHeartbeat.findUnique({ where: { id: "worker" } }),
  ]);
  return { settings: settings || { altTemplate: DEFAULT_TEMPLATE, confidenceThreshold: 95, autoProcess: false, autoApprove: false, autoAssign: false }, configured: (await loadAiSettings(shop, db)).configured, jobs, worker };
}

export function automationSettings(formData) {
  const settings = { ...validateSettings(formData), autoProcess: formData.get("autoProcess") === "on", autoApprove: formData.get("autoApprove") === "on", autoAssign: formData.get("autoAssign") === "on" };
  if (settings.autoApprove && settings.confidenceThreshold < 95) throw new Error("Automatic approval requires a confidence threshold of at least 95%.");
  return settings;
}

export async function handleAutomation({ shop, formData, db = prisma }) {
  try {
    const intent = formData.get("intent");
    if (intent === "settings") {
      const settings = automationSettings(formData);
      if ((settings.autoProcess || settings.autoApprove) && !(await loadAiSettings(shop, db)).configured) throw new Error("Configure the AI API key and model before enabling automation.");
      await db.imageSettings.upsert({ where: { shop }, create: { shop, ...settings }, update: settings });
      return { message: "Automation preferences saved." };
    }
    if (intent === "queueCatalog") {
      if (!(await loadAiSettings(shop, db)).configured) throw new Error("Configure AI analysis before processing the catalog.");
      const active = await db.workJob.findFirst({ where: { shop, kind: "catalog", status: { in: ["queued", "running"] } } });
      if (active) return { message: "A catalog job is already queued or running." };
      await enqueue({ shop, kind: "catalog" }, db);
      return { message: "Catalog processing queued. Keep the background worker running to process jobs." };
    }
    if (!["retry", "cancel"].includes(intent)) throw new Error("Unknown job action.");
    const id = String(formData.get("jobId") || "");
    await db.$transaction(async (tx) => {
      const job = await tx.workJob.findFirst({ where: { id, shop, status: { in: intent === "retry" ? ["failed"] : ["queued", "failed"] } } });
      if (!job) throw new Error("This job cannot be changed in its current state.");
      const changed = await tx.workJob.updateMany({ where: { id, shop, status: job.status }, data: intent === "retry"
        ? { status: "queued", attempts: 0, runAt: new Date(), error: null, leaseToken: null, lockedUntil: null }
        : { status: "cancelled" } });
      if (!changed.count) throw new Error("This job is already being processed.");
      if (intent === "cancel") {
        const payload = JSON.parse(job.payload);
        if (job.kind === "scan") await tx.siteScan.updateMany({ where: { id: payload.scanId, shop, status: { not: "completed" } }, data: { status: "failed", error: "Scan job cancelled." } });
        if (["optimize", "imageApply", "imageRestore"].includes(job.kind)) {
          const status = { optimize: "failed", imageApply: "prepared", imageRestore: "applied" }[job.kind];
          await tx.imageOptimization.updateMany({ where: { id: payload.optimizationId, shop }, data: { status, error: "Job cancelled. Already completed remote writes are checked before any retry.", ...(job.kind === "optimize" ? { activeMediaId: null } : {}) } });
        }
      }
    });
    return { message: intent === "retry" ? "Job queued for another attempt." : "Job cancelled. Already completed work is preserved." };
  } catch (error) { return { error: error.message }; }
}

export async function processCatalog({ job, payload, admin, db, assertActive }) {
  let after = payload.after || null;
  do {
    await assertActive();
    const data = await graphql(admin, `query VeyroCatalogQueue($after: String) { products(first: 100, after: $after, sortKey: ID) { nodes { id } pageInfo { hasNextPage endCursor } } }`, { after });
    for (const product of data.products.nodes) {
      await enqueue({ shop: job.shop, kind: "product", productId: product.id, dedupeKey: `catalog:${job.id}:${product.id}`, payload: { source: "catalog" } }, db);
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
    await db.workJob.updateMany({ where: { id: job.id, leaseToken: job.leaseToken }, data: { payload: JSON.stringify({ after }) } });
  } while (after);
}

export function imageFingerprint(product, image, template) {
  return createHash("sha256").update(JSON.stringify([product.title, product.category?.name, product.productType, product.options, image.image.url, template])).digest("hex");
}

export function canAutoApprove(review, settings) {
  return Boolean(settings?.autoApprove && review.matchedColor && review.confidence >= Math.max(95, settings.confidenceThreshold) && !review.originalAlt.trim());
}

export async function processProduct({ job, payload, admin, db, assertActive, vision = analyzeImage }) {
  let after = null;
  do {
    await assertActive();
    let settings = await db.imageSettings.findUnique({ where: { shop: job.shop } });
    if (payload.source === "webhook" && !settings?.autoProcess) return;
    const data = await graphql(admin, `query VeyroProcessImages($id: ID!, $after: String) { product(id: $id) {
      id title productType category { name } options { name values }
      media(first: 50, after: $after) { nodes { id alt ... on MediaImage { image { url } } } pageInfo { hasNextPage endCursor } }
    } }`, { id: job.productId, after });
    if (!data.product) return;
    const product = data.product;
    const colors = product.options.filter((option) => /^(color|colour)$/i.test(option.name)).flatMap((option) => option.values);
    for (const image of product.media.nodes.filter((media) => media.image?.url)) {
      await assertActive();
      settings = await db.imageSettings.findUnique({ where: { shop: job.shop } });
      if (payload.source === "webhook" && !settings?.autoProcess) return;
      const fingerprint = imageFingerprint(product, image, settings?.altTemplate || DEFAULT_TEMPLATE);
      const existing = await db.imageReview.findUnique({ where: { shop_mediaId: { shop: job.shop, mediaId: image.id } } });
      // Never overwrite a pending merchant review or a draft with an uncertain publish outcome.
      if (existing && (["pending", "applying"].includes(existing.status) || existing.sourceFingerprint === fingerprint)) continue;
      const analysis = await vision(image.image.url, colors, { shop: job.shop, db });
      await assertActive();
      const matchedColor = matchColor(analysis.color, colors);
      const values = { productId: product.id, productTitle: product.title, imageUrl: image.image.url, originalAlt: image.alt || "", detectedColor: analysis.color, matchedColor,
        generatedAlt: generateAlt(settings?.altTemplate || DEFAULT_TEMPLATE, { title: product.title, category: product.category?.name || product.productType || "", color: analysis.color.toLowerCase() === "unknown" ? "" : matchedColor || analysis.color }),
        confidence: analysis.confidence, sourceFingerprint: fingerprint, status: "pending", error: null, variantStatus: null };
      let review;
      if (existing) {
        const updated = await db.imageReview.updateMany({ where: { id: existing.id, shop: job.shop, status: existing.status, updatedAt: existing.updatedAt }, data: values });
        if (!updated.count) continue;
        review = { ...existing, ...values };
      } else {
        try { review = await db.imageReview.create({ data: { shop: job.shop, mediaId: image.id, ...values } }); }
        catch (error) { if (error.code === "P2002") continue; throw error; }
      }
      settings = await db.imageSettings.findUnique({ where: { shop: job.shop } });
      if (canAutoApprove(review, settings) && (payload.source !== "webhook" || settings.autoProcess)) {
        await assertActive();
        const formData = new FormData(); formData.set("intent", "approve"); formData.set("reviewId", review.id);
        if (settings.autoAssign) formData.set("assignVariants", "on");
        const result = await handleDashboardAction({ shop: job.shop, admin, db, formData, source: "automation", assertActive });
        if (result.error) throw new Error(result.error);
      }
    }
    after = product.media.pageInfo.hasNextPage ? product.media.pageInfo.endCursor : null;
  } while (after);
}
