// services/video.server.js

/**
 * Video SEO Service
 * Handles fetching product videos from Shopify, upserting them into the database,
 * generating VideoObject schema, and providing helper functions for routes.
 */

import { graphql } from "./shopify-api.server.js";
import prisma from "../db.server.js";

// GraphQL fragment for video media fields
const VIDEO_FIELDS = `
  id
  mediaContentType
  previewImage {
    url
  }
  ... on Video {
    sources {
      url
    }
    duration
    width
    height
  }
`;

/**
 * Fetch videos for a batch of products.
 * Returns array of objects containing product and video metadata.
 */
export async function fetchProductVideos({ admin, after = null }) {
  const query = `
    query VideoSync($after: String) {
      products(first: 100, after: $after, sortKey: ID) {
        nodes {
          id
          handle
          title
          publishedAt
          status
          media(first: 100) {
            edges {
              node {
                ${VIDEO_FIELDS}
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;
  const data = await graphql(admin, query, { after });
  const result = [];
  for (const product of data.products.nodes) {
    const videos = product.media.edges
      .map((e) => e.node)
      .filter((m) => m.mediaContentType === "VIDEO");
    for (const video of videos) {
      result.push({
        productId: product.id,
        productHandle: product.handle,
        productTitle: product.title,
        productStatus: product.status,
        videoId: video.id,
        videoUrl: video.sources?.[0]?.url || null,
        thumbnailUrl: video.previewImage?.url || null,
        duration: video.duration || null,
        width: video.width || null,
        height: video.height || null,
        position: null,
      });
    }
  }
  return { items: result, pageInfo: data.products.pageInfo };
}

/**
 * Upsert a list of video records into the Prisma `Video` model.
 */
export async function upsertVideos(videos) {
  const upserts = videos.map((v) =>
    prisma.video.upsert({
      where: { shop_videoId: { shop: v.shop, videoId: v.videoId } },
      create: {
        shop: v.shop,
        productId: v.productId,
        productHandle: v.productHandle,
        videoId: v.videoId,
        url: v.videoUrl,
        thumbnailUrl: v.thumbnailUrl,
        duration: v.duration,
        width: v.width,
        height: v.height,
        position: v.position,
      },
      update: {
        productId: v.productId,
        productHandle: v.productHandle,
        url: v.videoUrl,
        thumbnailUrl: v.thumbnailUrl,
        duration: v.duration,
        width: v.width,
        height: v.height,
        position: v.position,
        updatedAt: new Date(),
      },
    })
  );
  await Promise.all(upserts);
}

/**
 * Full synchronization job – iterates through all products and syncs videos.
 */
export async function syncAllVideos({ admin, shop }) {
  let after = null;
  do {
    const { items, pageInfo } = await fetchProductVideos({ admin, after });
    const enriched = items.map((i) => ({ ...i, shop }));
    if (enriched.length) await upsertVideos(enriched);
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
}

/**
 * Generate JSON‑LD VideoObject schema for a video record.
 */
export function generateVideoSchema(video, baseUrl) {
  if (!video.url) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.name || video.productTitle,
    description: video.description || "",
    thumbnailUrl: video.thumbnailUrl,
    uploadDate: video.createdAt?.toISOString().split("T")[0],
    duration: video.duration ? `PT${video.duration}S` : undefined,
    contentUrl: video.url,
    embedUrl: video.url,
    mainEntityOfPage: `${baseUrl}/video/${video.productHandle}`,
  };
  Object.keys(schema).forEach((k) => schema[k] === undefined && delete schema[k]);
  return schema;
}

