/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("standalone worker imports and exits with an empty queue", () => {
  const code = `
    global.prismaGlobal = {
      session: { count: async () => 0 },
      workJob: { findFirst: async () => null },
      workerHeartbeat: { upsert: async () => ({}), updateMany: async () => ({count: 1}) },
      $disconnect: async () => {}
    };
    process.argv.push('--once');
    await import('./scripts/worker.js');
    console.log('worker-bootstrap-ok');
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8", timeout: 30000,
    env: { ...process.env, NODE_ENV: "test", SHOPIFY_API_KEY: "test-key", SHOPIFY_API_SECRET: "test-secret", SHOPIFY_APP_URL: "https://app.example", OPENAI_API_KEY: "", GOOGLE_SERVICE_ACCOUNT_JSON: "", PAGESPEED_API_KEY: "" } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /worker-bootstrap-ok/);
});
