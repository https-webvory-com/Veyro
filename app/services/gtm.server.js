import db from "../db.server";

export async function getGtmIntegration(shop) {
  return db.integration.findUnique({
    where: { shop_platform: { shop, platform: "gtm" } },
  });
}

export async function listGtmContainers(shop) {
  // Placeholder — replace with real GTM API call once tokens are stored
  return [
    { id: "GTM-XXXXXX", name: "Example Container", status: "connected" },
  ];
}