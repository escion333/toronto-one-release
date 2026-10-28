/** Local UI contracts with owned message fixtures. No model or City requests. */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { lookupFailure } from "../src/lib/ai/lookup-recovery.ts";

const base = process.env.TORONTO_ONE_TEST_URL || "http://127.0.0.1:3100";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = resolve(".local/validation/demo-recovery");
await mkdir(output, { recursive: true });
const runtime = await chromium.launch({ headless: true });
const cases = [
  { name: "age", question: "What is the player’s age?", type: "number", answer: "32" },
  {
    name: "location",
    question: "Which neighbourhood works for you?",
    type: "text",
    answer: "King and Spadina",
  },
  {
    name: "date",
    question: "Which date works for you?",
    type: "date",
    answer: "2026-10-30",
  },
  {
    name: "choices",
    question: "Which sport would you like?",
    type: "text",
    answer: "Basketball",
    choices: ["Basketball", "Badminton"],
  },
];
const dateCase = cases.find((item) => item.name === "date");
assert.ok(dateCase);
try {
  for (const width of [390, 1440])
    for (const theme of ["light", "dark"] as const) {
      const context = await runtime.newContext({
        viewport: { width, height: 950 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      let messages: unknown[] = [];
      let submitted = "";
      await page.route("**/api/chat", async (route) => {
        if (route.request().method() === "GET") {
          await route.fulfill({ json: { messages, results: [], timings: [] } });
        } else if (route.request().method() === "POST") {
          const body: unknown = route.request().postDataJSON();
          if (
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "object" &&
            body.message !== null &&
            "text" in body.message &&
            typeof body.message.text === "string"
          )
            submitted = body.message.text;
          const events = [
            { type: "start", messageId: "fixture-response" },
            { type: "text-start", id: "text" },
            {
              type: "text-delta",
              id: "text",
              delta: "Controlled fixture answer received.",
            },
            { type: "text-end", id: "text" },
            { type: "finish" },
          ];
          await route.fulfill({
            contentType: "text/event-stream",
            headers: { "x-vercel-ai-ui-message-stream": "v1" },
            body:
              events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
              "data: [DONE]\n\n",
          });
        } else await route.abort();
      });
      await page.goto(base);
      await page
        .getByText("Find your next activity in Toronto.", { exact: true })
        .waitFor();
      assert.match(
        (await page.locator('meta[name="description"]').getAttribute("content")) ?? "",
        /recreation/i,
      );
      assert.doesNotMatch(
        (await page.locator('meta[name="description"]').getAttribute("content")) ?? "",
        /voting/i,
      );
      assert.equal(await page.locator('span[class*="serviceItem"]').count(), 60);
      const highlighted = page.locator('span[class*="serviceActive"]');
      assert.equal(await highlighted.count(), 1);
      assert.match((await highlighted.textContent()) ?? "", /Recreation/);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false,
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: resolve(output, `${width}-${theme}-recreation-landing.png`),
        fullPage: true,
      });
      await page.locator("#services").scrollIntoViewIfNeeded();
      assert.ok(await highlighted.isVisible());
      await page
        .getByText(/Explore City recreation programs, check the details/)
        .waitFor();
      await page.screenshot({
        path: resolve(output, `${width}-${theme}-recreation-services.png`),
        fullPage: true,
      });
      await page
        .getByRole("link", { name: "Start chat", exact: true })
        .first()
        .press("Enter");
      await page
        .getByRole("heading", { name: "Hey, neighbour.", exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Where do I vote?", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Reserve a tennis court", exact: true })
        .waitFor();
      for (const starter of [
        { title: "Find basketball near me", request: /City of Toronto basketball/ },
        {
          title: "Help me choose an activity",
          request: /choose a City of Toronto recreation activity/,
        },
      ]) {
        const button = page.getByRole("button", { name: starter.title, exact: true });
        const box = await button.boundingBox();
        assert.ok(box && box.height >= 44);
        await button.focus();
        assert.equal(
          await button.evaluate((el) => el === document.activeElement),
          true,
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({
          path: resolve(output, `${width}-${theme}-recreation-welcome.png`),
          fullPage: true,
        });
        await button.press("Enter");
        await page
          .getByText("Controlled fixture answer received.", { exact: true })
          .waitFor();
        assert.match(submitted, starter.request);
        assert.match(submitted, /Do not book anything\./);
        await page.goto(base + "/chat");
        await page
          .getByRole("heading", { name: "Hey, neighbour.", exact: true })
          .waitFor();
      }
      async function load(parts: unknown[], selector = ".inline-input-card") {
        messages = [{ id: "fixture-assistant", role: "assistant", parts }];
        await page.goto(base + "/chat");
        await page.locator(selector).last().waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          "No horizontal overflow",
        );
        assert.equal(
          await page.locator("html").evaluate((el) => el.classList.contains("dark")),
          theme === "dark",
        );
      }
      for (const item of width === 390 && theme === "light" ? cases : [dateCase]) {
        submitted = "";
        const spec = {
          question: item.question,
          inputType: item.type,
          ...("choices" in item ? { choices: item.choices } : {}),
        };
        await load([
          {
            type: "tool-requestResidentInput",
            toolCallId: "fixture-input",
            state: "output-available",
            input: spec,
            output: { status: "needs_input", ...spec },
          },
        ]);
        const input = page.locator(`.inline-input-card input[type=${item.type}]`);
        await input.fill(item.answer);
        await input.focus();
        assert.equal(await input.evaluate((el) => el === document.activeElement), true);
        const box = await input.boundingBox();
        assert.ok(box && box.height >= 44);
        await page.screenshot({
          path: resolve(output, `${width}-${theme}-${item.name}.png`),
          fullPage: true,
        });
        await input.press("Enter");
        await page
          .getByText("Controlled fixture answer received.", { exact: true })
          .waitFor();
        assert.equal(submitted, item.answer);
      }
      await load([
        { type: "text", text: "What day and time would work for basketball?" },
      ]);
      await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
      await page
        .getByText("Controlled fixture answer received.", { exact: true })
        .waitFor();
      assert.equal(submitted, "Tomorrow");
      await load([
        {
          type: "tool-browserOpen",
          toolCallId: "fixture-failure",
          state: "output-available",
          input: { url: "https://myvote.toronto.ca/home" },
          output: lookupFailure("voting", "redirected"),
        },
      ]);
      await page.getByRole("link", { name: "City election information" }).waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Try public lookup again" }).count(),
        0,
      );
      assert.equal(await page.locator(".message-source-disclosure").count(), 0);
      await page.screenshot({
        path: resolve(output, `${width}-${theme}-recovery.png`),
        fullPage: true,
      });
      await load([
        {
          type: "tool-browserOpen",
          toolCallId: "fixture-timeout",
          state: "output-available",
          input: { url: "https://www.toronto.ca/explore-enjoy/parks-recreation/" },
          output: lookupFailure("recreation", "timeout"),
        },
      ]);
      await page
        .getByRole("button", { name: "Try public lookup again", exact: true })
        .click();
      await page
        .getByText("Controlled fixture answer received.", { exact: true })
        .waitFor();
      assert.equal(submitted, lookupFailure("recreation", "timeout").retryPrompt);
      await load(
        [
          {
            type: "tool-browserOpen",
            toolCallId: "fixture-error",
            state: "output-error",
            input: { url: "https://www.toronto.ca/explore-enjoy/parks-recreation/" },
            errorText: "Controlled fixture failure",
          },
          {
            type: "tool-publishResult",
            toolCallId: "fixture-result",
            state: "output-available",
            input: {
              kind: "guidance",
              observationId: crypto.randomUUID(),
              facts: [{ label: "Owned fixture", quote: "Controlled fixture guidance" }],
            },
            output: {
              id: crypto.randomUUID(),
              kind: "guidance",
              title: "Controlled fixture guidance",
              sourceUrl: "https://www.toronto.ca/explore-enjoy/parks-recreation/",
              checkedAt: new Date().toISOString(),
              status: "information_found",
              facts: [{ label: "Owned fixture", quote: "Controlled fixture guidance" }],
            },
          },
        ],
        ".city-result-card",
      );
      await page.getByText("Lookup recovered", { exact: true }).waitFor();
      assert.equal(
        await page.getByText("A step needs attention", { exact: true }).count(),
        0,
      );
      await load([
        {
          type: "tool-requestResidentInput",
          toolCallId: "fixture-earlier",
          state: "output-available",
          input: { question: "What is the age?" },
          output: {
            status: "needs_input",
            question: "What is the age?",
            inputType: "number",
          },
        },
        {
          type: "tool-requestResidentInput",
          toolCallId: "fixture-latest",
          state: "output-available",
          input: { question: "Which date works?" },
          output: {
            status: "needs_input",
            question: "Which date works?",
            inputType: "date",
          },
        },
      ]);
      assert.equal(
        await page.locator('.inline-input-card input[type="number"]').isDisabled(),
        true,
      );
      assert.equal(
        await page.locator('.inline-input-card input[type="date"]').isEnabled(),
        true,
      );
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          width,
          theme,
          status: "passed",
          keyboardSubmission: true,
          questionFallback: true,
          redirectRecovery: true,
        }),
      );
      await context.close();
    }
} finally {
  await runtime.close();
}
