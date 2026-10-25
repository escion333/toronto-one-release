import test from "node:test";
import assert from "node:assert/strict";
import { applyLedger } from "../src/lib/ai/host-ledger.ts";

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
