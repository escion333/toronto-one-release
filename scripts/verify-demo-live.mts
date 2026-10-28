/** Opt-in local full demo: real Gateway calls and public City reads. No sign-in,
 * legal acceptance, payment or reservation. Private output stays under .local.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { z } from "zod";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";
import { torontoDate } from "../src/lib/ai/tennis-contracts.ts";

assert.ok(
  process.argv.includes("--live"),
  "Pass --live to authorize billable public lookup tests.",
);
const base = process.env.TORONTO_ONE_TEST_URL || "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve(".local/validation/demo-live");
await mkdir(output, { recursive: true });
const snapshotSchema = z.object({
  messages: z.array(
    z.object({ role: z.string(), parts: z.array(z.record(z.string(), z.unknown())) }),
  ),
  results: z.array(cityResultSchema),
});
async function snapshot(page: Page) {
  const response = await page.request.get(base + "/api/chat");
  assert.ok(response.ok());
  return snapshotSchema.parse(await response.json());
}
async function finished(page: Page, action: () => Promise<unknown>) {
  const responsePromise = page.waitForResponse(
    (r) => r.url() === base + "/api/chat" && r.request().method() === "POST",
    { timeout: 210_000 },
  );
  const [, response] = await Promise.all([action(), responsePromise]);
  assert.ok(response.ok(), `Chat HTTP ${response.status()}`);
  await page
    .getByRole("button", { name: "Send message", exact: true })
    .waitFor({ state: "visible", timeout: 210_000 });
}
async function send(page: Page, text: string) {
  await page
    .getByRole("textbox", { name: "Message Toronto One", exact: true })
    .fill(text);
  await finished(page, () =>
    page.getByRole("button", { name: "Send message", exact: true }).click(),
  );
}
const runtime = await chromium.launch({ headless: true });
try {
  const workflows = process.env.TORONTO_ONE_TEST_WORKFLOWS?.split(",") ?? [
    "voting",
    "recreation",
    "map-recovery",
    "tennis",
  ];
  for (const workflow of workflows) {
    assert.ok(["voting", "recreation", "map-recovery", "tennis"].includes(workflow));
    console.log(JSON.stringify({ workflow, status: "started" }));
    const context = await runtime.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(base);
      await page.getByRole("link", { name: "Start chat", exact: true }).first().click();
      await page
        .getByRole("textbox", { name: "Message Toronto One", exact: true })
        .waitFor();
      if (workflow === "voting") {
        await finished(page, () =>
          page.getByRole("button", { name: /Where do I vote/ }).click(),
        );
        await page
          .getByPlaceholder("Queen St & Bay St")
          .fill("King St West & Bathurst St");
        await finished(page, () =>
          page
            .getByRole("button", {
              name: "Find example voting information",
              exact: true,
            })
            .click(),
        );
        await page
          .getByRole("link", { name: "City election information", exact: false })
          .first()
          .waitFor();
        const state = await snapshot(page);
        assert.ok(
          state.messages.some((m) =>
            m.parts.some(
              (p) =>
                typeof p.output === "object" &&
                p.output !== null &&
                "code" in p.output &&
                p.output.code === "redirected",
            ),
          ),
        );
        assert.equal(
          state.results.filter((r) => r.kind === "voting").length,
          0,
          "No fabricated post-election assignment",
        );
      } else if (workflow === "recreation") {
        await send(
          page,
          "Find basketball near King and Spadina. Ask me the player’s age, then which day works, before searching. Do not prepare or submit a reservation.",
        );
        const age = page.locator('.inline-input-card input[type="number"]').last();
        await age.waitFor();
        await age.fill("32");
        await finished(page, () => age.press("Enter"));
        const day = page.locator(".inline-input-card input").last();
        await day.waitFor();
        const tomorrow = new Date(`${torontoDate()}T12:00:00Z`);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        await day.fill(
          (await day.getAttribute("type")) === "date"
            ? tomorrow.toISOString().slice(0, 10)
            : "Tomorrow",
        );
        await finished(page, () => day.press("Enter"));
        await send(
          page,
          "You may expand to next week and use Canoe Landing. Show one adult basketball activity’s actual detail and displayed availability, even if full or not yet open. Do not prepare or submit a reservation.",
        );
        await page.locator(".city-result-card").first().waitFor();
        const state = await snapshot(page);
        assert.ok(
          state.results.some(
            (r) =>
              r.kind === "recreation" &&
              /basketball/i.test(r.facts.map((f) => f.quote).join(" ")) &&
              /Canoe Landing/i.test(r.facts.map((f) => f.quote).join(" ")),
          ),
        );
        assert.ok(
          !state.messages.some((m) =>
            m.parts.some((p) => p.type === "tool-prepareRecreationBooking"),
          ),
        );
        const count = state.results.length;
        await page.reload();
        await page.locator(".city-result-card").first().waitFor();
        assert.equal((await snapshot(page)).results.length, count);
      } else if (workflow === "map-recovery") {
        await send(
          page,
          "For a 32-year-old, find adult basketball at Canoe Landing next week. First check the City’s drop-in sports map at https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/sports/drop-in-sports-map/ and use an approved alternative if unavailable. Show one checked activity detail with its actual availability. Do not prepare or submit a booking.",
        );
        const state = await snapshot(page);
        assert.ok(
          state.messages.some((m) =>
            m.parts.some(
              (p) =>
                typeof p.output === "object" &&
                p.output !== null &&
                "recovery" in p.output,
            ),
          ),
          "Map maintenance must trigger the coded alternative",
        );
        assert.ok(
          state.results.some((r) => r.kind === "recreation"),
          "Alternative must produce a real sourced activity card",
        );
      } else {
        await finished(page, () =>
          page
            .getByRole("button", { name: "Reserve a tennis court", exact: true })
            .click(),
        );
        if (
          (await page
            .getByRole("button", { name: "Choose court date & time", exact: true })
            .count()) === 0
        ) {
          const current = await snapshot(page);
          const court = current.results
            .flatMap((result) => result.facts)
            .map((fact) => /^Court - \d+ - .+$/m.exec(fact.quote)?.[0])
            .find((name) => name !== undefined);
          assert.ok(court, "A planning choice must come from an actual observed court");
          await send(
            page,
            `I understand that the observed fees may exceed $0. Show a planning card for ${court} so I can view the date, time and group-size form. Keep my maximum at $0, disclose the fees, and do not sign in or submit a reservation.`,
          );
        }
        await page
          .getByRole("button", { name: "Choose court date & time", exact: true })
          .first()
          .waitFor();
        await page
          .getByRole("button", { name: "Choose court date & time", exact: true })
          .first()
          .click();
        await page.getByLabel("Maximum total · CAD", { exact: true }).waitFor();
        assert.equal(
          await page.getByLabel("Maximum total · CAD", { exact: true }).inputValue(),
          "0.00",
        );
        const courtDate = new Date(`${torontoDate()}T12:00:00Z`);
        courtDate.setUTCDate(courtDate.getUTCDate() + 2);
        await page
          .getByLabel("Date", { exact: true })
          .fill(courtDate.toISOString().slice(0, 10));
        await page.getByLabel("Start time · Toronto", { exact: true }).fill("18:00");
        await page.getByLabel("People playing", { exact: true }).fill("2");
        // Stop before Check with City account: no private browser or transaction.
      }
      const state = await snapshot(page);
      const unexpectedErrors = state.messages.flatMap((m) =>
        m.parts.filter((p) => p.state === "output-error"),
      );
      assert.equal(
        unexpectedErrors.length,
        0,
        "No unhandled tool errors in the demo flow",
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: resolve(output, workflow + ".png"),
        fullPage: true,
      });
      console.log(
        JSON.stringify({
          workflow,
          status: "passed",
          cards: state.results.map((r) => ({ kind: r.kind, sourceUrl: r.sourceUrl })),
          bookingSubmitted: false,
        }),
      );
    } catch (error) {
      await page
        .screenshot({ path: resolve(output, workflow + "-failed.png"), fullPage: true })
        .catch(() => undefined);
      throw error;
    } finally {
      await page.request.delete(base + "/api/chat");
      await context.close();
    }
  }
} finally {
  await runtime.close();
}
