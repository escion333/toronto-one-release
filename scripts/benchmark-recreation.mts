/** Read-only model/browser benchmark. Separate disposable cookie; never authenticates or books. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";
const base = "http://127.0.0.1:3000";
let cookie = "";
let spanCount = 0;
try {
  for (const [run, text] of [
    [
      "cold",
      "Find one adult badminton session at Canoe Landing next week. Publish one real detail card even if full. Do not inspect alternatives, and do not book anything.",
    ],
    [
      "warm",
      "Now find one available adult basketball session at Canoe Landing next week. Publish ONE inspected activity card, with date, time, location, age, free-reservation notice and actual availability. Do not book anything.",
    ],
  ]) {
    const start = performance.now();
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
    let buffer = "";
    const decoder = new TextDecoder();
    let deltas = 0;
    let cards = 0;
    const tools: string[] = [];
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of block.split("\n")) {
          if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
          const event = z
            .object({
              type: z.string(),
              toolName: z.string().optional(),
              errorText: z.string().optional(),
              output: z.unknown().optional(),
            })
            .passthrough()
            .parse(JSON.parse(line.slice(6)));
          if (event.type === "text-delta") deltas++;
          if (event.type === "tool-input-available" && event.toolName)
            tools.push(event.toolName);
          if (event.type === "tool-output-error" || event.type === "error")
            console.log(
              JSON.stringify({
                run,
                event: event.type,
                error: event.errorText?.slice(0, 700),
              }),
            );
          if (
            event.type === "tool-output-available" &&
            cityResultSchema.safeParse(event.output).success
          )
            cards++;
        }
      }
    }
    const snapshot = z
      .object({
        timings: z.array(
          z.object({ phase: z.string(), ms: z.number(), ok: z.boolean() }),
        ),
      })
      .parse(
        await (
          await fetch(`${base}/api/chat`, { headers: { Cookie: cookie, Origin: base } })
        ).json(),
      );
    const spans = snapshot.timings.slice(spanCount);
    spanCount = snapshot.timings.length;
    console.log(
      JSON.stringify({
        run,
        elapsedMs: Math.round(performance.now() - start),
        deltas,
        cards,
        tools,
        phaseMs: spans.reduce<Record<string, number>>((total, span) => {
          total[span.phase] = (total[span.phase] ?? 0) + span.ms;
          return total;
        }, {}),
        failedSpans: spans.filter((s) => !s.ok),
      }),
    );
    assert.ok(
      deltas > 0 && cards > 0 && tools.length > 0,
      "Expected real streaming, tools and a verified activity card.",
    );
  }
} finally {
  if (cookie)
    await fetch(`${base}/api/chat`, {
      method: "DELETE",
      headers: { Cookie: cookie, Origin: base },
    });
}
