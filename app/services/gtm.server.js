import db from "../db.server";
import { INTEGRATION_PUBLIC_FIELDS } from "./google-oauth.server";

export async function getGtmIntegration(shop) {
  return db.integration.findUnique({
    where: { shop_platform: { shop, platform: "gtm" } },
    select: INTEGRATION_PUBLIC_FIELDS,
  });
}

// Reading containers from the GTM API is not built yet, so report none rather than invent any.
export async function listGtmContainers() {
  return [];
}