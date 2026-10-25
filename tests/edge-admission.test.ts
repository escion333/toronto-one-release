import assert from "node:assert/strict";
import test from "node:test";
import {
  ChatAdmission,
  containerAllocation,
  hashClientAddress,
} from "../deploy/cloudflare/admission.ts";
import { launchEndsAt, launchStartedAt } from "../src/lib/ai/launch-policy.ts";

function request(address = "192.0.2.1", returning = false) {
  const headers = new Headers({ "CF-Connecting-IP": address });
  if (returning)
    headers.set("cookie", "toronto-one-agent=12345678-1234-1234-1234-123456789abc");
  return new Request("https://www.tomsanee.com/toronto-one/api/chat", {
    method: "POST",
    headers,
  });
}

test("edge bursts are isolated by client address, refill, and include returning visits", async () => {
  const admission = new ChatAdmission();
  for (let index = 0; index < 60; index++)
    assert.equal((await admission.admit(request("192.0.2.1", true), 0)).allowed, true);
  assert.deepEqual(await admission.admit(request("192.0.2.1", true), 0), {
    allowed: false,
    retryAfterSeconds: 1,
  });
  assert.equal((await admission.admit(request("192.0.2.2", true), 0)).allowed, true);
  assert.equal((await admission.admit(request("192.0.2.1", true), 1000)).allowed, true);
});

test("new-browser bursts do not consume the remaining allowance for returning neighbours", async () => {
  const admission = new ChatAdmission();
  for (let index = 0; index < 30; index++)
    assert.equal((await admission.admit(request(), 0)).allowed, true);
  assert.deepEqual(await admission.admit(request(), 0), {
    allowed: false,
    retryAfterSeconds: 2,
  });
  // Judges sharing one IP retain capacity once their visit cookie is established.
  for (let index = 0; index < 30; index++)
    assert.equal((await admission.admit(request("192.0.2.1", true), 0)).allowed, true);
  assert.equal((await admission.admit(request("192.0.2.1", true), 0)).allowed, false);
  assert.equal((await admission.admit(request(), 2000)).allowed, true);
});

test("edge storage stays bounded, evicts least-recent clients and expires idle entries", async () => {
  const admission = new ChatAdmission(3);
  for (let index = 1; index <= 5; index++)
    await admission.admit(request(`192.0.2.${index}`), index);
  assert.equal(admission.size, 3);
  await admission.admit(request("192.0.2.6"), 120_006);
  assert.equal(admission.size, 1);
});

test("missing platform address headers share a bounded fallback without authentication authority", async () => {
  const admission = new ChatAdmission();
  const absent = new Request("https://www.tomsanee.com/toronto-one/api/chat", {
    method: "POST",
    headers: { cookie: "toronto-one-agent=not-a-session" },
  });
  for (let index = 0; index < 30; index++)
    assert.equal((await admission.admit(absent, 0)).allowed, true);
  assert.equal((await admission.admit(absent, 0)).allowed, false);
  assert.equal(admission.size, 1);
});

test("stored address keys are salted SHA-256 digests rather than raw client identifiers", async () => {
  const first = await hashClientAddress("192.0.2.1", "fixture-secret-salt");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, await hashClientAddress("192.0.2.1", "fixture-secret-salt"));
  assert.notEqual(
    first,
    await hashClientAddress("192.0.2.1", "different-isolate-salt"),
  );
  assert.notEqual(first, await hashClientAddress("192.0.2.2", "fixture-secret-salt"));
});

test("new starts use the fixed launch capacity only inside the original 48-hour window", () => {
  const start = Date.parse(launchStartedAt);
  const end = Date.parse(launchEndsAt);
  assert.equal(end - start, 48 * 60 * 60_000);
  assert.deepEqual(containerAllocation(start), {
    profile: "launch",
    vcpu: 2,
    memoryMib: 8192,
    diskMb: 16384,
  });
  for (const now of [start - 1, end, end + 1])
    assert.deepEqual(containerAllocation(now), {
      profile: "normal",
      vcpu: 1,
      memoryMib: 4096,
      diskMb: 8192,
    });
});
