import { authenticate } from "../shopify.server.js";
import db from "../db.server.js";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const original = url.searchParams.get("variant") === "original";
  const row = await db.imageOptimization.findFirst({ where: { id: url.searchParams.get("id") || "", shop: session.shop }, select: original ? { originalData: true, mimeType: true } : { optimizedData: true, mimeType: true } });
  const bytes = original ? row?.originalData : row?.optimizedData;
  if (!bytes || !["image/jpeg", "image/png"].includes(row?.mimeType)) return new Response("Image not found", { status: 404 });
  return new Response(bytes, { headers: { "Content-Type": row.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'" } });
};
