import { setTimeout as delay } from "node:timers/promises";
import db from "../app/db.server.js";
import { unauthenticated } from "../app/shopify.server.js";
import { runOneJob } from "../app/services/queue.server.js";
import { processCatalog, processProduct } from "../app/services/automation.server.js";
import { processScan } from "../app/services/technical.server.js";
import { processOptimization, publishOptimization } from "../app/services/optimizer.server.js";
import { processGoogle } from "../app/services/google.server.js";

let stopping = false;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
const beat = () => db.workerHeartbeat.upsert({ where: { id: "worker" }, create: { id: "worker", status: "running", lastSeenAt: new Date() }, update: { status: "running", lastSeenAt: new Date() } });
const interval = setInterval(() => { beat().catch((error) => console.error("Worker heartbeat failed:", error.message)); }, 15000);
try {
  await beat();
  do {
    const worked = await runOneJob({ db, getAdmin: async (shop) => (await unauthenticated.admin(shop)).admin,
      handlers: { catalog: processCatalog, product: processProduct, scan: processScan, optimize: processOptimization, imageApply: publishOptimization, imageRestore: (context) => publishOptimization({ ...context, restore: true }), performance: processGoogle, searchConsole: processGoogle, sitemapSubmit: processGoogle } });
    if (process.argv.includes("--once")) break;
    if (!worked) await delay(2000);
  } while (!stopping);
} finally {
  clearInterval(interval);
  await db.workerHeartbeat.updateMany({ where: { id: "worker" }, data: { status: "stopped", lastSeenAt: new Date() } });
  await db.$disconnect();
}
