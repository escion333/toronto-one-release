/** Explicit, read-only live check: six cookie-isolated visitors, no City booking. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";

assert.ok(
  process.argv.includes("--live"),
  "Pass --live to authorize real model and public City discovery requests.",
);
const base = process.env.TORONTO_ONE_TEST_URL ?? "https://www.tomsanee.com/toronto-one";
const url = new URL(base);
assert.ok(["127.0.0.1", "localhost", "www.tomsanee.com"].includes(url.hostname));
const origin = url.origin;
const texts = [
  "Find example voting information near the Toronto intersection Queen St W and Bay St. Use a nearby public example address, not a personal assignment.",
  "Find one adult drop-in swimming or badminton activity at Canoe Landing Community Recreation Centre. Inspect the activity detail and show a sourced result. Do not prepare a booking.",
  "Who created Toronto One?",
  "What two City services can you help me with?",
  "Can you explain what Toronto One does in one sentence?",
  "Can you help discover recreation activities without making a reservation?",
];
const visitors = texts.map((text) => ({
  text,
  id: randomUUID(),
  cookie: "",
  resultIds: new Set<string>(),
  kinds: new Set<string>(),
  textParts: 0,
}));
const healthSchema = z.object({
  admission: z.object({ active: z.number(), queued: z.number() }).nullable().optional(),
});
let peakActive = 0;
let peakQueued = 0;
let finished = false;
const monitor = (async () => {
  while (!finished) {
    const response = await fetch(`${base}/api/health`, {
      signal: AbortSignal.timeout(10_000),
    });
    const state = healthSchema.parse(await response.json()).admission;
    if (state) {
      peakActive = Math.max(peakActive, state.active);
      peakQueued = Math.max(peakQueued, state.queued);
    }
    await delay(1500);
  }
})();
try {
  await Promise.all(
    visitors.map(async (visitor, index) => {
      const started = performance.now();
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { id: visitor.id, text: visitor.text } }),
        signal: AbortSignal.timeout(450_000),
      });
      assert.equal(response.status, 200, `Visitor ${index} was rejected at admission.`);
      visitor.cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
      assert.ok(visitor.cookie.startsWith("toronto-one-agent="));
      assert.ok(response.body);
      let buffer = "";
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
            const event: unknown = JSON.parse(line.slice(6));
            if (typeof event !== "object" || event === null || !("type" in event))
              continue;
            assert.notEqual(
              event.type,
              "error",
              `Visitor ${index} received a stream error.`,
            );
            if (event.type === "text-delta") visitor.textParts++;
            if (event.type === "tool-input-available" && "toolName" in event)
              assert.ok(
                !["prepareRecreationBooking", "recreationBookingStatus"].includes(
                  String(event.toolName),
                ),
                "Discovery must not prepare or submit a booking.",
              );
            if (event.type === "tool-output-available" && "output" in event) {
              const parsed = cityResultSchema.safeParse(event.output);
              if (parsed.success) {
                visitor.resultIds.add(parsed.data.id);
                visitor.kinds.add(parsed.data.kind);
              }
            }
          }
        }
      }
      assert.ok(
        visitor.textParts > 0,
        `Visitor ${index} did not receive real model text.`,
      );
      console.log(
        JSON.stringify({
          visitor: index,
          status: "completed",
          elapsedMs: Math.round(performance.now() - started),
          resultKinds: [...visitor.kinds],
        }),
      );
    }),
  );
  assert.equal(
    new Set(visitors.map((v) => v.cookie)).size,
    visitors.length,
    "Session cookies must be independent.",
  );
  const retainedSchema = z.object({
    messages: z.array(z.object({ id: z.string(), role: z.string() })),
    results: cityResultSchema.array(),
  });
  for (const [index, visitor] of visitors.entries()) {
    const response = await fetch(`${base}/api/chat`, {
      headers: { Origin: origin, Cookie: visitor.cookie },
    });
    assert.equal(response.status, 200);
    const retained = retainedSchema.parse(await response.json());
    assert.ok(retained.messages.some((m) => m.id === visitor.id));
    for (const other of visitors)
      if (other !== visitor) {
        assert.ok(
          !retained.messages.some((m) => m.id === other.id),
          "Another visitor's message leaked.",
        );
        assert.ok(
          !retained.results.some((r) => other.resultIds.has(r.id)),
          "Another visitor's result leaked.",
        );
      }
    if (index === 0)
      assert.ok(
        retained.results.some(
          (r) => r.kind === "voting" && r.voting?.lookup.type === "intersection",
        ),
        "Real voting discovery result required.",
      );
    if (index === 1)
      assert.ok(
        retained.results.some((r) => r.kind === "recreation"),
        "Real recreation discovery result required.",
      );
  }
  assert.ok(peakActive <= 3, "Launch active concurrency exceeded capacity.");
  console.log(
    JSON.stringify({
      status: "passed",
      independentVisitors: visitors.length,
      peakActive,
      peakQueued,
      bookingAttempted: false,
    }),
  );
} finally {
  finished = true;
  await monitor;
  await Promise.all(
    visitors
      .filter((v) => v.cookie)
      .map((v) =>
        fetch(`${base}/api/chat`, {
          method: "DELETE",
          headers: { Origin: origin, Cookie: v.cookie },
        }),
      ),
  );
}
