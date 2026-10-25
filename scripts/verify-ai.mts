/** Live application test: requires a running app and billable Gateway access.
 * Uses only the City's public example address; never attempts a reservation.
 * Logs counts, source URLs and timing, never chat/page text or credentials.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cityResultSchema, type CityResult } from "../src/lib/ai/contracts.ts";

const base = process.env.TORONTO_ONE_TEST_URL || "http://127.0.0.1:3000";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Use a local test server.",
);
let cookie = "";
const findings: CityResult[] = [];
let measuredSpans = 0;
async function turn(text: string, kind?: CityResult["kind"]) {
  const started = Date.now();
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
    body: JSON.stringify({ message: { id: randomUUID(), text } }),
    signal: AbortSignal.timeout(190_000),
  });
  cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
  if (!response.ok)
    throw new Error(`Chat HTTP ${response.status}: ${await response.text()}`);
  assert.ok(response.body);
  const tools: string[] = [];
  let deltas = 0;
  let firstEventMs: number | undefined;
  let buffer = "";
  let resultCount = 0;
  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        const event: unknown = JSON.parse(line.slice(6));
        if (typeof event !== "object" || event === null || !("type" in event)) continue;
        firstEventMs ??= Date.now() - started;
        if (event.type === "error") {
          throw new Error(
            "errorText" in event && typeof event.errorText === "string"
              ? event.errorText
              : "Stream error",
          );
        }
        if (event.type === "text-delta") deltas++;
        if (
          event.type === "tool-input-available" &&
          "toolName" in event &&
          typeof event.toolName === "string"
        )
          tools.push(event.toolName);
        if (event.type === "tool-output-available" && "output" in event) {
          const result = cityResultSchema.safeParse(event.output);
          if (result.success) {
            findings.push(result.data);
            console.log(
              JSON.stringify({
                event: "sourced_card",
                kind: result.data.kind,
                sourceUrl: result.data.sourceUrl,
                labels: result.data.facts.map((fact) => fact.label),
                requestedLocationQuoted: result.data.facts.some((fact) =>
                  /Canoe Landing/i.test(fact.quote),
                ),
              }),
            );
            if (result.data.kind === kind) resultCount++;
          }
        }
        if (event.type === "tool-output-error")
          console.log(JSON.stringify({ event: "recoverable_tool_error" }));
      }
    }
  }
  assert.ok(deltas > 0, "Expected genuine streamed model text.");
  assert.ok(tools.length > 0, "Expected model-selected tool invocation.");
  if (kind) assert.ok(resultCount > 0, `Expected a sourced ${kind} card.`);
  const snapshot = await fetch(`${base}/api/chat`, {
    headers: { Cookie: cookie, Origin: base },
  });
  const timings = z
    .object({
      timings: z.array(
        z.object({ phase: z.string(), ms: z.number(), ok: z.boolean() }),
      ),
    })
    .parse(await snapshot.json()).timings;
  const spans = timings.slice(measuredSpans);
  measuredSpans = timings.length;
  const phaseMs = spans.reduce<Record<string, number>>((totals, span) => {
    totals[span.phase] = (totals[span.phase] ?? 0) + span.ms;
    return totals;
  }, {});
  console.log(
    JSON.stringify({
      workflow: kind || "clarification",
      streamedTextDeltas: deltas,
      tools,
      resultCount,
      firstEventMs,
      phaseMs,
      failedSpans: spans.filter((span) => !span.ok).length,
      elapsedMs: Date.now() - started,
    }),
  );
}
try {
  await turn(
    "Help me find my Toronto municipal election voting place. What do you need from me?",
  );
  await turn(
    "Use the City-published public example address 63 Commissioners St, Toronto to look up its assigned election-day voting place and hours. This is a public example, not my personal address.",
    "voting",
  );
  await turn(
    "Find adult badminton at Canoe Landing next week. If it is full, inspect one other adult sport there. Show at least one real activity detail with its displayed availability, dates, location and age restriction. Do not book anything.",
    "recreation",
  );
  const voting = findings.find((result) => result.kind === "voting");
  assert.ok(voting);
  const votingExcerpts = voting.facts.map((fact) => fact.quote).join("\n");
  assert.match(
    votingExcerpts,
    /Ralph Thornton Community Centre/i,
    "The public example must return its observed assigned place.",
  );
  assert.match(
    votingExcerpts,
    /October 26|Oct\.? 26|2026-10-26/i,
    "Include the actual election-day date.",
  );
  assert.match(
    votingExcerpts,
    /10\s*(?::00)?\s*a\.?m/i,
    "Include official opening hours.",
  );
  assert.match(
    votingExcerpts,
    /8\s*(?::00)?\s*p\.?m|20:00/i,
    "Include official closing hours.",
  );
  const activities = findings.filter((result) => result.kind === "recreation");
  assert.ok(
    activities.some((result) =>
      /Canoe Landing/i.test(result.facts.map((fact) => fact.quote).join("\n")),
    ),
    "At least one activity card must support the requested location.",
  );
  const restored = await fetch(`${base}/api/chat`, {
    headers: { Cookie: cookie, Origin: base },
  });
  assert.ok(restored.ok);
  const snapshot: unknown = await restored.json();
  assert.ok(
    typeof snapshot === "object" &&
      snapshot !== null &&
      "results" in snapshot &&
      Array.isArray(snapshot.results),
  );
  assert.ok(
    snapshot.results.length >= findings.length,
    "Findings must survive page refresh.",
  );
  const activity = activities.at(-1);
  assert.ok(activity?.plan);
  const approve = (digest: string) =>
    fetch(`${base}/api/booking-handoff`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify({ id: activity.plan?.id, digest, approved: true }),
    });
  const tampered = await approve("0".repeat(64));
  assert.equal(tampered.status, 409, "A changed approval must not trigger handoff.");
  const approved = await approve(activity.plan.digest);
  assert.ok(approved.ok, `Handoff recheck failed: ${await approved.text()}`);
  const retained = await fetch(`${base}/api/chat`, {
    headers: { Cookie: cookie, Origin: base },
  });
  const retainedSnapshot: unknown = await retained.json();
  assert.ok(
    typeof retainedSnapshot === "object" &&
      retainedSnapshot !== null &&
      "results" in retainedSnapshot,
  );
  const retainedCards = cityResultSchema.array().parse(retainedSnapshot.results);
  assert.equal(
    retainedCards.find((result) => result.id === activity.id)?.handoff?.url,
    activity.sourceUrl,
    "Prepared link must survive refresh.",
  );
  console.log(
    JSON.stringify({
      workflow: "handoff",
      status: "server_rechecked_and_retained",
      tamperedApprovalRejected: true,
      reservationStatus: "not_reserved",
    }),
  );
  for (const result of findings)
    console.log(
      JSON.stringify({
        kind: result.kind,
        sourceUrl: result.sourceUrl,
        checkedAt: result.checkedAt,
        status: result.status,
      }),
    );
  console.log(
    JSON.stringify({
      status: "passed",
      scope: "real_model_stream_and_shared_browser_tools",
      bookingAttempted: false,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Live verification failed.");
  process.exitCode = 1;
} finally {
  if (cookie)
    await fetch(`${base}/api/chat`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: base },
    }).catch(() => undefined);
}
