import { test } from "node:test";
import assert from "node:assert/strict";
import { HealthController } from "../dist/apps/api/infrastructure/health/health.controller.js";

function response() {
  const result = {};
  return { result, status(code) { result.code = code; return { json(body) { result.body = body; return body; } }; } };
}

test("liveness checks the database only, so a storage outage does not mark the API unhealthy", async () => {
  let storageCalls = 0;
  const ok = new HealthController({ $queryRaw: async () => [1] }, { checkBucket: async () => { storageCalls += 1; throw new Error("down"); } });
  const res = response();
  await ok.health(res);
  assert.equal(res.result.code, 200);
  assert.equal(res.result.body.database, "connected");
  assert.equal(storageCalls, 0);

  const down = new HealthController({ $queryRaw: async () => { throw new Error("db down"); } }, { checkBucket: async () => {} });
  const res2 = response();
  await down.health(res2);
  assert.equal(res2.result.code, 503);
});

test("readiness reports database and storage, returns 503 when one is down, and caches checks for 10 seconds", async () => {
  let storageCalls = 0;
  let storageUp = false;
  const controller = new HealthController({ $queryRaw: async () => [1] }, { checkBucket: async () => { storageCalls += 1; if (!storageUp) throw new Error("down"); } });
  const first = response();
  await controller.ready(first);
  assert.equal(first.result.code, 503);
  assert.deepEqual([first.result.body.database, first.result.body.storage], ["up", "down"]);

  storageUp = true;
  const cached = response();
  await controller.ready(cached);
  assert.equal(cached.result.code, 503, "cached result within 10 seconds");
  assert.equal(storageCalls, 1, "a burst of readiness calls makes one storage check");
});

test("a hanging dependency is reported down after the 3 second timeout instead of blocking", async () => {
  const controller = new HealthController({ $queryRaw: async () => [1] }, { checkBucket: () => new Promise(() => {}) });
  const started = Date.now();
  const res = response();
  await controller.ready(res);
  assert.equal(res.result.body.storage, "down");
  assert.ok(Date.now() - started < 4000);
});
