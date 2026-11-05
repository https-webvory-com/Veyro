import { createHash } from "node:crypto";
import sharp from "sharp";
import prisma from "../db.server.js";
import { graphql, checkUserErrors } from "./shopify-api.server.js";
import { enqueue } from "./queue.server.js";
import { publicGet } from "./public-fetch.server.js";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const summary = { id: true, mediaId: true, status: true, originalBytes: true, optimizedBytes: true, width: true, height: true, error: true, createdAt: true };

export function optimizerOptions(formData) {
  const quality = Number(formData.get("quality")); const maxWidth = Number(formData.get("maxWidth"));
  if (!Number.isInteger(quality) || quality < 50 || quality > 95 || !Number.isInteger(maxWidth) || maxWidth < 320 || maxWidth > 4096) throw new Error("Choose quality 50–95 and maximum width 320–4096 pixels.");
  return { quality, maxWidth };
}

export async function compressImage(bytes, { quality, maxWidth }) {
  const image = sharp(bytes, { limitInputPixels: 40000000, animated: true });
  const metadata = await image.metadata();
  if (!["jpeg", "png"].includes(metadata.format) || (metadata.pages || 1) > 1) throw new Error("Only non-animated JPEG and PNG originals are supported. Other formats are preserved.");
  const resized = image.rotate().resize({ width: maxWidth, withoutEnlargement: true });
  const pipeline = metadata.format === "jpeg" ? resized.jpeg({ quality, mozjpeg: true }) : resized.png({ compressionLevel: 9, palette: false });
  const output = await pipeline.toBuffer({ resolveWithObject: true });
  return { bytes: output.data, width: output.info.width, height: output.info.height, mimeType: metadata.format === "jpeg" ? "image/jpeg" : "image/png" };
}

async function fileInfo(admin, id) {
  const data = await graphql(admin, `query VeyroOriginalImage($id: ID!) { node(id: $id) { ... on MediaImage { id fileStatus originalSource { url } image { url width height } } } }`, { id });
  if (!data.node?.id) throw new Error("This image is not available in the current shop.");
  return data.node;
}

async function originalBytes(admin, id, get = publicGet) {
  const file = await fileInfo(admin, id);
  if (file.fileStatus !== "READY" || !file.originalSource?.url) throw new Error("Shopify is still processing this image. Retry when it is ready.");
  const url = file.originalSource.url;
  const response = await get(url, { origin: new URL(url).origin, maxBytes: 20 * 1024 * 1024 });
  if (response.status !== 200) throw new Error("Could not download the original image.");
  return { bytes: response.body, url };
}

export async function loadOptimizer({ admin, shop, db = prisma }) {
  const result = { images: [], optimizations: [] };
  try {
    result.optimizations = await db.imageOptimization.findMany({ where: { shop }, select: summary, orderBy: { createdAt: "desc" }, take: 50 });
    const data = await graphql(admin, `query VeyroImageFiles { files(first: 30, query: "media_type:IMAGE", sortKey: CREATED_AT, reverse: true) { nodes { ... on MediaImage { id alt image { url width height } } } } }`);
    result.images = data.files.nodes.filter((file) => file.image?.url).map((file) => ({ id: file.id, alt: file.alt || "", ...file.image }));
  } catch (error) { result.error = error.message; }
  return result;
}

export async function handleOptimizer({ admin, shop, formData, db = prisma }) {
  try {
    const intent = formData.get("intent");
    if (intent === "prepare") {
      const mediaId = String(formData.get("mediaId") || "");
      if (!/^gid:\/\/shopify\/MediaImage\/\d+$/.test(mediaId)) throw new Error("Select a Shopify image.");
      const options = optimizerOptions(formData);
      await fileInfo(admin, mediaId);
      const row = await db.imageOptimization.create({ data: { shop, mediaId, activeMediaId: mediaId, ...options } });
      try { await enqueue({ shop, kind: "optimize", payload: { optimizationId: row.id } }, db); }
      catch (error) { await db.imageOptimization.update({ where: { id: row.id }, data: { status: "failed", activeMediaId: null, error: error.message } }); throw error; }
      return { message: "Image queued for backup and compression. Shopify is unchanged until you approve the preview." };
    }
    if (!["apply", "restore"].includes(intent)) throw new Error("Unknown optimization action.");
    const id = String(formData.get("optimizationId") || "");
    const expected = intent === "apply" ? "prepared" : "applied";
    const row = await db.imageOptimization.findFirst({ where: { id, shop, status: expected }, select: { id: true } });
    if (!row) throw new Error("This image cannot be changed in its current state.");
    const next = intent === "apply" ? "applying" : "restoring";
    // Persist the transition and its job together; a crash cannot leave an unqueued attempt.
    await db.$transaction(async (tx) => {
      const claim = await tx.imageOptimization.updateMany({ where: { id, shop, status: expected }, data: { status: next, error: null } });
      if (!claim.count) throw new Error("This image is already being processed.");
      await enqueue({ shop, kind: intent === "apply" ? "imageApply" : "imageRestore", payload: { optimizationId: id } }, tx);
    });
    return { message: intent === "apply" ? "Approved image replacement queued." : "Original image restoration queued." };
  } catch (error) { return { error: error.code === "P2002" ? "This image already has an active optimization. Review it before preparing another." : error.message }; }
}

export async function processOptimization({ job, payload, admin, db, assertActive, get = publicGet }) {
  const row = await db.imageOptimization.findFirst({ where: { id: payload.optimizationId, shop: job.shop } });
  if (!row || !["queued", "failed"].includes(row.status)) return;
  try {
    await assertActive();
    const original = await originalBytes(admin, row.mediaId, get);
    const optimized = await compressImage(original.bytes, row);
    await assertActive();
    const smaller = optimized.bytes.length < original.bytes.length;
    await db.imageOptimization.updateMany({ where: { id: row.id, shop: job.shop }, data: {
      status: smaller ? "prepared" : "unchanged", activeMediaId: smaller ? row.mediaId : null,
      originalData: original.bytes, optimizedData: optimized.bytes, originalHash: hash(original.bytes), sourceUrl: original.url,
      originalBytes: original.bytes.length, optimizedBytes: optimized.bytes.length, width: optimized.width, height: optimized.height, mimeType: optimized.mimeType, error: null,
    } });
  } catch (error) {
    await db.imageOptimization.updateMany({ where: { id: row.id, shop: job.shop }, data: { status: "failed", error: error.message } });
    throw error;
  }
}

async function replaceOriginal(admin, row, bytes, assertActive) {
  const filename = `veyro-${row.id}.${row.mimeType === "image/jpeg" ? "jpg" : "png"}`;
  const staged = await graphql(admin, `mutation VeyroStageImage($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }`, {
    input: [{ filename, mimeType: row.mimeType, resource: "IMAGE", httpMethod: "POST", fileSize: String(bytes.length) }],
  });
  const target = checkUserErrors(staged.stagedUploadsCreate).stagedTargets?.[0];
  if (!target || new URL(target.url).protocol !== "https:") throw new Error("Shopify did not provide a secure upload target.");
  const body = new FormData();
  for (const parameter of target.parameters) body.append(parameter.name, parameter.value);
  body.append("file", new Blob([bytes], { type: row.mimeType }), filename);
  const upload = await fetch(target.url, { method: "POST", body, redirect: "error", signal: AbortSignal.timeout(45000) });
  if (!upload.ok) throw new Error(`Staged image upload failed (${upload.status}).`);
  await assertActive();
  const updated = await graphql(admin, `mutation VeyroReplaceImage($files: [FileUpdateInput!]!) { fileUpdate(files: $files) { files { id fileStatus } userErrors { field message } } }`, { files: [{ id: row.mediaId, originalSource: target.resourceUrl }] });
  const result = checkUserErrors(updated.fileUpdate);
  if (!result.files?.some((file) => file.id === row.mediaId)) throw new Error("Shopify did not confirm the image replacement.");
}

export async function publishOptimization({ job, payload, admin, db, assertActive, restore = false, get = publicGet, replace = replaceOriginal }) {
  const row = await db.imageOptimization.findFirst({ where: { id: payload.optimizationId, shop: job.shop } });
  if (!row || row.status === (restore ? "restored" : "applied")) return;
  if (!row.originalData || !row.optimizedData || !row.originalHash) throw new Error("A verified backup is required before image replacement.");
  try {
    await assertActive();
    const targetBytes = Buffer.from(restore ? row.originalData : row.optimizedData);
    const targetHash = hash(targetBytes);
    const current = await originalBytes(admin, row.mediaId, get);
    const currentHash = hash(current.bytes);
    if (currentHash !== targetHash) {
      const expected = restore ? row.appliedHash : row.originalHash;
      if (!expected || currentHash !== expected) throw new Error("The Shopify image changed since this version was saved. The app will not overwrite it. Inspect the image before retrying.");
      await replace(admin, row, targetBytes, assertActive);
      let verified = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        await assertActive();
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try { const next = await originalBytes(admin, row.mediaId, get); if (hash(next.bytes) === targetHash) { verified = true; break; } } catch { /* Shopify processes images asynchronously. */ }
      }
      if (!verified) throw new Error("Shopify is still processing or has transformed the upload. Retry the job to verify the image before another write.");
    }
    await db.imageOptimization.updateMany({ where: { id: row.id, shop: job.shop }, data: { status: restore ? "restored" : "applied", appliedHash: restore ? row.appliedHash : targetHash, activeMediaId: restore ? null : row.mediaId, error: null } });
  } catch (error) {
    await db.imageOptimization.updateMany({ where: { id: row.id, shop: job.shop }, data: { status: restore ? "restoring" : "applying", error: error.message } });
    throw error;
  }
}
