import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import {
  launchPolicy,
  launchStartedAt,
  launchEndsAt,
} from "../src/lib/ai/launch-policy.ts";
import { RunQueue } from "../src/lib/ai/run-queue.ts";

const start = Date.parse(launchStartedAt);
const end = Date.parse(launchEndsAt);
test("fixed launch window lasts exactly48hours and expires without a restart", () => {
  assert.equal(end - start, 48 * 60 * 60_000);
  assert.equal(launchPolicy(start - 1).launch, false);
  assert.equal(launchPolicy(start).launch, true);
  assert.equal(launchPolicy(end - 1).dailyTurns, 5000);
  const normal = launchPolicy(end);
  assert.equal(normal.launch, false);
  assert.equal(normal.dailyTurns, 250);
  assert.equal(normal.concurrentRuns, 2);
  assert.equal(normal.maxSessions, 80);
  assert.notEqual(normal.spendKey, launchPolicy(start).spendKey);
  assert.equal(launchPolicy(end + 24 * 60 * 60_000).launch, false);
});
test("independent visitors wait FIFO instead of being rejected at active capacity", async () => {
  const queue = new RunQueue(() => launchPolicy(start));
  const releases = await Promise.all(
    ["one", "two", "three"].map((id) => queue.acquire(id)),
  );
  const order: string[] = [];
  const fourth = queue.acquire("four").then((release) => {
    order.push("four");
    return release;
  });
  const fifth = queue.acquire("five").then((release) => {
    order.push("five");
    return release;
  });
  assert.deepEqual(queue.status(), { active: 3, queued: 2 });
  releases[0]?.();
  const releaseFourth = await fourth;
  assert.deepEqual(order, ["four"]);
  assert.deepEqual(queue.status(), { active: 3, queued: 1 });
  releases[0]?.(); // release is idempotent
  assert.equal(queue.status().active, 3);
  releaseFourth();
  const releaseFifth = await fifth;
  assert.deepEqual(order, ["four", "five"]);
  releaseFifth();
  releases[1]?.();
  releases[2]?.();
  assert.deepEqual(queue.status(), { active: 0, queued: 0 });
});
test("duplicate owner cannot acquire twice; aborted queued visitor frees their position", async () => {
  const queue = new RunQueue(() => ({ ...launchPolicy(start), concurrentRuns: 1 }));
  const first = await queue.acquire("one");
  await assert.rejects(queue.acquire("one"), /already running/);
  const controller = new AbortController();
  const waiting = queue.acquire("two", controller.signal);
  const rejected = assert.rejects(waiting, { name: "AbortError" });
  controller.abort();
  await rejected;
  assert.deepEqual(queue.status(), { active: 1, queued: 0 });
  first();
  const retry = await queue.acquire("two");
  retry();
  assert.deepEqual(queue.status(), { active: 0, queued: 0 });
});
test("finite queue and waiting deadline bound memory and abandoned visitors", async () => {
  const queue = new RunQueue(() => ({
    ...launchPolicy(start),
    concurrentRuns: 1,
    maxQueued: 1,
    queueWaitMs: 5,
  }));
  const first = await queue.acquire("one");
  const expired = assert.rejects(queue.acquire("two"), /busy/);
  await assert.rejects(queue.acquire("three"), /busy/);
  await delay(12);
  await expired;
  assert.deepEqual(queue.status(), { active: 1, queued: 0 });
  first();
});
test("expiry lowers concurrency for future grants without interrupting running visitors", async () => {
  let now = start;
  const queue = new RunQueue(() => launchPolicy(now));
  const releases = await Promise.all(
    ["one", "two", "three"].map((id) => queue.acquire(id)),
  );
  const fourth = queue.acquire("four");
  now = end;
  releases[0]?.();
  assert.deepEqual(queue.status(), { active: 2, queued: 1 });
  releases[1]?.();
  const releaseFourth = await fourth;
  assert.deepEqual(queue.status(), { active: 2, queued: 0 });
  releases[2]?.();
  releaseFourth();
  assert.deepEqual(queue.status(), { active: 0, queued: 0 });
});
