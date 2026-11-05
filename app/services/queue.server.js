import { randomUUID } from "node:crypto";
import prisma from "../db.server.js";

export async function enqueue({ shop, kind, productId = null, payload = {}, dedupeKey = null }, db = prisma) {
  try { return await db.workJob.create({ data: { shop, kind, productId, payload: JSON.stringify(payload), dedupeKey } }); }
  catch (error) {
    if (error.code === "P2002" && dedupeKey) return db.workJob.findUnique({ where: { dedupeKey } });
    throw error;
  }
}

export async function claimJob(db = prisma, now = new Date()) {
  const available = { OR: [{ status: "queued", runAt: { lte: now } }, { status: "running", lockedUntil: { lt: now } }] };
  const job = await db.workJob.findFirst({ where: available, orderBy: { runAt: "asc" } });
  if (!job) return null;
  if (job.attempts >= 3) {
    await db.workJob.updateMany({ where: { id: job.id, ...available }, data: { status: "failed", error: "Maximum attempts reached. Review and retry the job.", leaseToken: null, lockedUntil: null } });
    return null;
  }
  const leaseToken = randomUUID();
  const claimed = await db.workJob.updateMany({ where: { id: job.id, status: job.status, leaseToken: job.leaseToken }, data: {
    status: "running", attempts: { increment: 1 }, leaseToken, lockedUntil: new Date(now.getTime() + 120000),
  } });
  return claimed.count ? { ...job, attempts: job.attempts + 1, leaseToken } : null;
}

export async function runOneJob({ handlers, getAdmin, db = prisma }) {
  const job = await claimJob(db);
  if (!job) return false;
  let alive = true;
  const leaseWhere = { id: job.id, status: "running", leaseToken: job.leaseToken };
  const heartbeat = setInterval(() => {
    db.workJob.updateMany({ where: leaseWhere, data: { lockedUntil: new Date(Date.now() + 120000) } })
      .then((result) => { if (!result.count) alive = false; }).catch(() => { alive = false; });
  }, 15000);
  async function assertActive() {
    if (!alive || !(await db.workJob.findFirst({ where: leaseWhere }))) throw new Error("Job lease lost or job cancelled.");
    if (!(await db.session.findFirst({ where: { shop: job.shop, isOnline: false } }))) throw new Error("Shop is no longer installed. Reopen the app to reconnect.");
  }
  try {
    await assertActive();
    const admin = await getAdmin(job.shop);
    const handler = handlers[job.kind];
    if (!handler) throw new Error(`Unsupported job type: ${job.kind}`);
    await handler({ job, payload: JSON.parse(job.payload), admin, db, assertActive });
    await db.workJob.updateMany({ where: leaseWhere, data: { status: "completed", leaseToken: null, lockedUntil: null, error: null } });
  } catch (error) {
    await db.workJob.updateMany({ where: leaseWhere, data: { status: job.attempts >= 3 ? "failed" : "queued",
      error: String(error.message).slice(0, 1000), runAt: new Date(Date.now() + 30000 * 2 ** (job.attempts - 1)), leaseToken: null, lockedUntil: null } });
  } finally { clearInterval(heartbeat); }
  return true;
}
