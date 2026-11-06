import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  await db.$transaction([
    db.aiConnection.deleteMany({ where: { shop } }),
    db.integration.deleteMany({ where: { shop } }),
    db.googleCredential.deleteMany({ where: { shop } }),
    db.shopifyOrder.deleteMany({ where: { shop } }),
    db.channelRule.deleteMany({ where: { shop } }),
    db.attributionSettings.deleteMany({ where: { shop } }),
    db.trackingEvent.deleteMany({ where: { shop } }),
    db.trackingHealth.deleteMany({ where: { shop } }),
    db.auditIssue.deleteMany({ where: { shop } }),
    db.video.deleteMany({ where: { shop } }),
    db.integrationReport.deleteMany({ where: { shop } }),
    db.workJob.deleteMany({ where: { shop } }),
    db.siteScan.deleteMany({ where: { shop } }),
    db.imageOptimization.deleteMany({ where: { shop } }),
    db.imageChange.deleteMany({ where: { shop } }),
    db.seoDraft.deleteMany({ where: { shop } }),
    db.imageReview.deleteMany({ where: { shop } }),
    db.imageSettings.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);

  return new Response();
};
