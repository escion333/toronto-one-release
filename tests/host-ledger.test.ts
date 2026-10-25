import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applyLedger } from "../src/lib/ai/host-ledger.ts";
import {
  launchEndsAt,
  launchPolicy,
  launchStartedAt,
} from "../src/lib/ai/launch-policy.ts";

function store() {
  const values = new Map<string, unknown>();
  return {
    values,
    async get(key: string) {
      return values.get(key);
    },
    async put(key: string, value: unknown) {
      values.set(key, value);
    },
  };
}
const key = "a".repeat(64);
test("host journal preserves unknown intent and refuses another delivery", async () => {
  const storage = store();
  assert.equal(
    (
      await applyLedger(storage, {
        action: "claim",
        key,
        value: { password: "must-not-persist" },
      })
    ).status,
    200,
  );
  assert.equal((await applyLedger(storage, { action: "claim", key })).status, 409);
  assert.deepEqual(
    await (await applyLedger(storage, { action: "exists", key })).json(),
    { exists: true },
  );
  assert.equal(
    JSON.stringify([...storage.values.values()]).includes("must-not-persist"),
    false,
  );
  assert.equal((await applyLedger(storage, { action: "confirm", key })).status, 200);
  assert.equal((await applyLedger(storage, { action: "claim", key })).status, 409);
});
test("host journal cannot create a confirmation without prior intent", async () => {
  const storage = store();
  assert.equal((await applyLedger(storage, { action: "confirm", key })).status, 409);
  assert.equal(storage.values.size, 0);
});
test("daily quota survives new callers and stops at its configured limit", async () => {
  const storage = store();
  const input = { action: "reserve", key: "usage-2026-10-25" };
  assert.equal((await applyLedger(storage, input, 2)).status, 200);
  assert.equal((await applyLedger(storage, input, 2)).status, 200);
  assert.equal((await applyLedger(storage, input, 2)).status, 429);
  assert.equal(storage.values.get(input.key), 2);
});
test("ledger rejects arbitrary keys, malformed actions and quota/journal confusion", async () => {
  const storage = store();
  for (const input of [
    null,
    { action: "claim", key: "../account" },
    { action: "claim", key: "usage-2026-10-25" },
    { action: "reserve", key },
    { action: "delete", key },
  ])
    assert.equal((await applyLedger(storage, input)).status, 400);
  assert.equal(storage.values.size, 0);
});

const launchNow = Date.parse(launchStartedAt) + 60_000;
const launchKey = `spend-${launchPolicy(launchNow).spendKey}`;
function spend(
  action: "reserve-spend" | "settle-spend",
  id: string,
  amountMicros: number,
) {
  return { action, key: launchKey, value: { id, amountMicros } };
}

test("launch turn allowance exceeds100 and remains bounded at10000", async () => {
  const storage = store();
  const input = { action: "reserve", key: "usage-launch-2026-10-25" };
  storage.values.set(input.key, 4999);
  assert.equal((await applyLedger(storage, input, 5000)).status, 200);
  assert.equal((await applyLedger(storage, input, 5000)).status, 429);
  storage.values.set(input.key, 9999);
  assert.equal((await applyLedger(storage, input, 50_000)).status, 200);
  assert.equal((await applyLedger(storage, input, 50_000)).status, 429);
});

test("atomic host transactions serialize competing model reservations at the authoritative ceiling", async () => {
  const storage = store();
  let previous = Promise.resolve();
  const calls = Array.from({ length: 60 }, () => {
    const response = previous.then(() =>
      applyLedger(
        storage,
        spend("reserve-spend", randomUUID(), 1_000_000),
        9999,
        launchNow,
      ),
    );
    previous = response.then(() => {});
    return response;
  });
  const responses = await Promise.all(calls);
  assert.equal(responses.filter((response) => response.status === 200).length, 45);
  assert.equal(responses.filter((response) => response.status === 429).length, 15);
  assert.equal(storage.values.get(launchKey), 45_000_000);
  assert.equal(
    storage.values.size,
    46,
    "Small UUID records are stored separately from totals.",
  );
});

test("model holds and settlements are idempotent and cannot refund beyond a matching hold", async () => {
  const storage = store();
  const id = randomUUID();
  for (let repeat = 0; repeat < 2; repeat++)
    assert.equal(
      (await applyLedger(storage, spend("reserve-spend", id, 1_000_000), 50, launchNow))
        .status,
      200,
    );
  assert.equal(storage.values.get(launchKey), 1_000_000);
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", id, 2_000_000), 50, launchNow))
      .status,
    409,
  );
  assert.equal(
    (await applyLedger(storage, spend("settle-spend", id, 1_000_001), 50, launchNow))
      .status,
    409,
  );
  assert.equal(
    (await applyLedger(storage, spend("settle-spend", randomUUID(), 0), 50, launchNow))
      .status,
    409,
  );
  for (let repeat = 0; repeat < 2; repeat++)
    assert.equal(
      (await applyLedger(storage, spend("settle-spend", id, 1234), 50, launchNow))
        .status,
      200,
    );
  assert.equal(storage.values.get(launchKey), 1234);
  assert.equal(
    (await applyLedger(storage, spend("settle-spend", id, 0), 50, launchNow)).status,
    409,
  );
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", id, 1_000_000), 50, launchNow))
      .status,
    409,
    "A settled reservation cannot authorize a fresh provider call.",
  );
});

test("launch expiry keeps unknown holds and prevents reopening an old budget", async () => {
  const storage = store();
  const id = randomUUID();
  const expired = Date.parse(launchEndsAt) + 1;
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", id, 45_000_000), 50, launchNow))
      .status,
    200,
  );
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", randomUUID(), 1), 50, launchNow))
      .status,
    429,
  );
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", randomUUID(), 1), 50, expired))
      .status,
    409,
  );
  assert.equal(
    storage.values.get(launchKey),
    45_000_000,
    "Unknown outcomes never expire/refund.",
  );
  const currentKey = `spend-${launchPolicy(expired).spendKey}`;
  assert.equal(
    (
      await applyLedger(
        storage,
        { ...spend("reserve-spend", randomUUID(), 3_000_000), key: currentKey },
        5000,
        expired,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await applyLedger(
        storage,
        { ...spend("reserve-spend", randomUUID(), 1), key: currentKey },
        5000,
        expired,
      )
    ).status,
    429,
  );
  assert.equal(
    (await applyLedger(storage, spend("settle-spend", id, 800), 50, expired)).status,
    200,
    "A known old call can settle only its original bucket.",
  );
  assert.equal(storage.values.get(launchKey), 800);
  assert.equal(storage.values.get(currentKey), 3_000_000);
});

test("spend input, storage corruption and quota/journal confusion fail closed", async () => {
  const storage = store();
  for (const input of [
    { action: "claim", key: launchKey },
    { action: "reserve-spend", key },
    {
      action: "reserve-spend",
      key: launchKey,
      value: { id: "../bad", amountMicros: 1 },
    },
    spend("reserve-spend", randomUUID(), -1),
    spend("reserve-spend", randomUUID(), 1.5),
    spend("reserve-spend", randomUUID(), Number.MAX_SAFE_INTEGER + 1),
  ])
    assert.equal((await applyLedger(storage, input, 50, launchNow)).status, 400);
  assert.equal(storage.values.size, 0);
  storage.values.set(launchKey, { corrupt: true });
  assert.equal(
    (await applyLedger(storage, spend("reserve-spend", randomUUID(), 1), 50, launchNow))
      .status,
    503,
  );
});

test("interrupted local writes can retain extra holds but never duplicate a refund", async () => {
  const storage = store();
  const id = randomUUID();
  await applyLedger(storage, spend("reserve-spend", id, 1000), 50, launchNow);
  const interrupted = {
    get: storage.get,
    async put(key: string, value: unknown) {
      if (key === launchKey) throw new Error("Fixture write interrupted");
      await storage.put(key, value);
    },
  };
  await assert.rejects(
    applyLedger(interrupted, spend("settle-spend", id, 100), 50, launchNow),
  );
  assert.equal(storage.values.get(launchKey), 1000);
  assert.equal(
    (await applyLedger(storage, spend("settle-spend", id, 100), 50, launchNow)).status,
    200,
  );
  assert.equal(
    storage.values.get(launchKey),
    1000,
    "No second refund after uncertain persistence.",
  );
});
