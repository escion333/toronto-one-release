import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  makeCheckoutApproval,
  verifyCheckoutApproval,
  attemptKey,
  priorAttempt,
  recordOutboundAttempt,
  recordConfirmedAttempt,
  extractReceiptNumber,
  type CheckoutPayload,
} from "../src/lib/ai/booking-approval.ts";
import {
  readBookingCheckpoint,
  writeBookingCheckpoint,
  removeBookingCheckpoint,
} from "../src/lib/ai/booking-checkpoint.ts";
import { randomUUID } from "node:crypto";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { getSession, removeSession } from "../src/lib/ai/session.ts";
import { bookingMascotState } from "../src/lib/ai/booking-contracts.ts";
import { ExecutionTimings } from "../src/lib/ai/timing.ts";
const payload = (): CheckoutPayload => ({
  activity: {
    url: "https://anc.ca.apm.activecommunities.com/toronto/activity/search/detail/123456",
    number: "123456",
    name: "Synthetic unit-test activity",
    dates: "Synthetic date",
    location: "Synthetic venue",
    feeNotice: "Synthetic zero-dollar fixture",
  },
  participant: "Synthetic Participant",
  totalCents: 0,
  currency: "CAD",
  waiver: "Synthetic waiver",
  waiverAccepted: true,
});
test("final checkout approval binds activity, participant, costs, waiver and exact revision", () => {
  const input = payload();
  const plan = makeCheckoutApproval(input, 100);
  assert.equal(verifyCheckoutApproval(plan, plan.id, plan.digest, input, 101), plan);
  for (const changed of [
    { ...input, participant: "Another person" },
    { ...input, activity: { ...input.activity, number: "777777" } },
    { ...input, waiver: "Changed terms" },
  ])
    assert.throws(() =>
      verifyCheckoutApproval(plan, plan.id, plan.digest, changed, 101),
    );
  assert.throws(() =>
    verifyCheckoutApproval(undefined, plan.id, plan.digest, input, 101),
  );
  assert.throws(() =>
    verifyCheckoutApproval(plan, plan.id, "0".repeat(64), input, 101),
  );
  assert.throws(() =>
    verifyCheckoutApproval(plan, plan.id, plan.digest, input, plan.expiresAt),
  );
  plan.consumed = true;
  assert.throws(() => verifyCheckoutApproval(plan, plan.id, plan.digest, input, 101));
});
test("approval snapshot is immutable relative to the source and detects internal tampering", () => {
  const input = payload();
  const plan = makeCheckoutApproval(input, 100);
  input.activity.name = "Changed";
  assert.notEqual(input.activity.name, plan.payload.activity.name);
  plan.payload.activity.number = "999999";
  assert.throws(() =>
    verifyCheckoutApproval(plan, plan.id, plan.digest, plan.payload, 101),
  );
});
test("attempt key deduplicates the same participant and activity across sessions", () => {
  assert.equal(
    attemptKey(payload()),
    attemptKey({ ...payload(), participant: " synthetic participant " }),
  );
  assert.notEqual(
    attemptKey(payload()),
    attemptKey({ ...payload(), participant: "Other Participant" }),
  );
});
test("timing instrumentation preserves failed spans and records durations without payloads", async () => {
  const timing = new ExecutionTimings();
  await assert.rejects(
    timing.measure("external_wait", async () => {
      throw new Error("Private input must not be recorded");
    }),
  );
  assert.equal(timing.spans[0]?.ok, false);
  assert.ok((timing.spans[0]?.ms ?? -1) >= 0);
  assert.equal(JSON.stringify(timing.spans).includes("Private input"), false);
});

test("outbound journal atomically blocks duplicate delivery and retains an unknown outcome across new approvals", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "toronto-one-approval-"));
  try {
    const plan = makeCheckoutApproval(payload());
    const results = await Promise.allSettled([
      recordOutboundAttempt(plan, directory),
      recordOutboundAttempt(plan, directory),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await priorAttempt(payload(), directory), true);
    await assert.rejects(
      recordOutboundAttempt(makeCheckoutApproval(payload()), directory),
    );
    const file = path.join(directory, `${attemptKey(payload())}.json`);
    const pending = JSON.parse(await readFile(file, "utf8"));
    assert.equal(pending.status, "outcome_unknown");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.stringify(pending).includes("Synthetic Participant"), false);
    await recordConfirmedAttempt(plan, "1234567.0001", directory);
    const confirmed = JSON.parse(await readFile(file, "utf8"));
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.sentAt, pending.sentAt);
    assert.equal(confirmed.receiptNumber, "1234567.0001");
    await assert.rejects(
      recordOutboundAttempt(makeCheckoutApproval(payload()), directory),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("receipt parsing requires an actual numbered reference, never the word receipt alone", () => {
  assert.equal(
    extractReceiptNumber("Your receipt #1234567.0001 has been completed!"),
    "1234567.0001",
  );
  assert.equal(extractReceiptNumber("Receipt number: AB-12345"), "AB-12345");
  for (const text of [
    "A printed receipt is required",
    "Receipt sent to your email",
    "Receipt number pending",
    "Your order is complete",
  ])
    assert.equal(extractReceiptNumber(text), undefined);
});

test("booking mascot follows real work, resident input, unknown outcomes and confirmation without masking chat", () => {
  const input = {
    base: "idle" as const,
    status: "ready" as const,
    busy: false,
    error: false,
    activeChat: false,
    focused: false,
  };
  assert.equal(bookingMascotState({ ...input, status: "executing" }), "working");
  assert.equal(
    bookingMascotState({ ...input, status: "review_required" }),
    "needs_input",
  );
  assert.equal(bookingMascotState({ ...input, status: "outcome_unknown" }), "error");
  assert.equal(bookingMascotState({ ...input, status: "confirmed" }), "success");
  assert.equal(
    bookingMascotState({ ...input, status: "confirmed", error: true }),
    "error",
  );
  assert.equal(
    bookingMascotState({ ...input, status: "confirmed", focused: true }),
    "listening",
  );
  assert.equal(
    bookingMascotState({
      ...input,
      status: "confirmed",
      activeChat: true,
      base: "thinking",
    }),
    "thinking",
  );
});

test("model booking status returns verification booleans without private account or receipt identifiers", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    session.booking.snapshot = () => ({
      status: "confirmed",
      message: "Synthetic confirmation status",
      timings: [],
      activity: payload().activity,
      participants: [
        { id: "00000000-0000-4000-8000-000000000000", label: "Synthetic Participant" },
      ],
      receipt: {
        number: "SYNTHETIC-PRIVATE-REFERENCE",
        capturedAt: "2026-01-01",
        accountVerified: true,
        evidenceUrl: "/api/recreation/receipt?format=pdf",
      },
    });
    const execute = createCityAgent(session).tools.recreationBookingStatus.execute;
    assert.ok(execute);
    const output = await execute(
      {},
      { toolCallId: "synthetic-status-test", messages: [], context: undefined },
    );
    assert.deepEqual(output, {
      status: "confirmed",
      message: "Synthetic confirmation status",
      officialReceiptCaptured: true,
      accountEnrollmentVerified: true,
      printableReceiptCaptured: true,
    });
    assert.equal(JSON.stringify(output).includes("Synthetic Participant"), false);
    assert.equal(JSON.stringify(output).includes("SYNTHETIC-PRIVATE-REFERENCE"), false);
  } finally {
    await removeSession(session);
  }
});

test("private confirmed-task checkpoint restores only its owner within expiry and omits participant selection/approval", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "toronto-one-checkpoint-"));
  const owner = randomUUID();
  const artifact = `${randomUUID()}-official-receipt.pdf`;
  try {
    await writeBookingCheckpoint(
      owner,
      {
        status: "confirmed",
        message: "Synthetic confirmed fixture",
        timings: [],
        activity: payload().activity,
        participants: [{ id: randomUUID(), label: "Synthetic private participant" }],
        review: {
          id: randomUUID(),
          digest: "synthetic-approval",
          expiresAt: 1000,
          participant: "Synthetic private participant",
          totalCents: 0,
          currency: "CAD",
          terms: "Synthetic private approval",
        },
        receipt: {
          number: "SYNTHETIC-REFERENCE",
          capturedAt: "2026-01-01",
          accountVerified: true,
          evidenceUrl: "/api/recreation/receipt?format=pdf",
        },
      },
      undefined,
      artifact,
      directory,
      100,
    );
    const restored = readBookingCheckpoint(owner, 101, directory);
    assert.ok(restored);
    assert.equal(restored.state.status, "confirmed");
    assert.equal(restored.pdfFile, artifact);
    assert.equal(
      JSON.stringify(restored).includes("Synthetic private participant"),
      false,
    );
    assert.equal(JSON.stringify(restored).includes("synthetic-approval"), false);
    assert.equal(readBookingCheckpoint(randomUUID(), 101, directory), undefined);
    assert.equal(readBookingCheckpoint("../../outside", 101, directory), undefined);
    assert.equal(
      readBookingCheckpoint(owner, restored.expiresAt, directory),
      undefined,
    );
    await removeBookingCheckpoint(owner, directory);
    assert.equal(readBookingCheckpoint(owner, 101, directory), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
