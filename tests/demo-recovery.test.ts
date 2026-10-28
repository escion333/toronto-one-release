import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";
import { CityBrowser } from "../src/lib/ai/browser.ts";
import { CITY_ENTRY_POINTS, approvedPageUrl } from "../src/lib/ai/policy.ts";
import { questionFromText, residentQuestion } from "../src/lib/ai/resident-question.ts";
import {
  CityLookupError,
  lookupFailure,
  lookupFailureFromOutput,
} from "../src/lib/ai/lookup-recovery.ts";
import { publicAIError } from "../src/lib/ai/errors.ts";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { getSession, removeSession } from "../src/lib/ai/session.ts";
import { messageSources } from "../src/lib/ai/sources.ts";

test("clarifications retain a free answer, infer age/date controls and reject conversational approvals", () => {
  assert.equal(questionFromText("What is the player’s age?")?.inputType, "number");
  assert.deepEqual(questionFromText("What day and time works for you?")?.choices, [
    "Today",
    "Tomorrow",
    "This weekend",
  ]);
  assert.equal(
    residentQuestion({ question: "Which date works?", inputType: "date" })?.inputType,
    "date",
  );
  assert.deepEqual(
    residentQuestion({ question: "Which sport?", choices: ["Basketball", "Tennis"] })
      ?.choices,
    ["Basketball", "Tennis"],
  );
  assert.equal(questionFromText("I found a current activity."), null);
  for (const question of [
    "What is your password?",
    "Do you accept the waiver?",
    "May I confirm this booking?",
    "What is your credit card number?",
  ])
    assert.equal(questionFromText(question), null);
});

test("lookup recovery rebuilds safe actions and nested errors keep their public cause", () => {
  const failure = lookupFailureFromOutput({
    ...lookupFailure("recreation", "timeout"),
    message: "private-fixture",
    alternatives: [{ label: "Private", url: "https://evil.example" }],
  });
  assert.ok(failure);
  assert.doesNotMatch(JSON.stringify(failure), /private-fixture|evil\.example/);
  assert.match(failure.retryPrompt ?? "", /Do not prepare or submit any booking/);
  assert.equal(lookupFailure("voting", "redirected").retryPrompt, null);
  assert.equal(lookupFailure("public", "human_verification").retryPrompt, null);
  assert.match(
    publicAIError(
      new Error("SDK wrapper with private-fixture", {
        cause: new CityLookupError("redirected"),
      }),
    ),
    /MyVote redirected/,
  );
  assert.match(
    publicAIError(
      new Error("SDK wrapper", {
        cause: new Error(
          "That page observation is stale. Observe the current page first.",
        ),
      }),
    ),
    /controls changed/,
  );
  assert.doesNotMatch(publicAIError(new Error("private-fixture")), /private-fixture/);
  assert.equal(
    approvedPageUrl(CITY_ENTRY_POINTS.canoeLanding),
    CITY_ENTRY_POINTS.canoeLanding,
  );
  assert.throws(() =>
    approvedPageUrl(CITY_ENTRY_POINTS.canoeLanding.replace("index.html", "checkout")),
  );
});

test("public recovery handles redirect, map maintenance, transient reads and challenges without City traffic", async () => {
  const runtime = await chromium.launch({ headless: true });
  let transientReads = 0;
  let challengeReads = 0;
  const browser = new CityBrowser(async () => {
    const context = await runtime.newContext({ serviceWorkers: "block" });
    // Owned fixtures intercept every request. No City request or booking occurs.
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "myvote.toronto.ca") {
        await route.fulfill({
          status: 302,
          headers: { location: CITY_ENTRY_POINTS.electionGuide },
        });
      } else if (url.pathname.endsWith("drop-in-sports-map/")) {
        await route.fulfill({
          contentType: "text/html",
          body: "<main>Controlled fixture: This map is currently down for maintenance.</main>",
        });
      } else if (url.searchParams.has("transient")) {
        transientReads++;
        await route.fulfill({
          status: transientReads === 1 ? 503 : 200,
          contentType: "text/html",
          body: "<main>Controlled fixture recovered</main>",
        });
      } else if (url.searchParams.has("challenge")) {
        challengeReads++;
        await route.fulfill({
          contentType: "text/html",
          body: "<main>Controlled fixture: Verify you are human</main>",
        });
      } else {
        await route.fulfill({
          contentType: "text/html",
          body: "<main>Controlled fixture: 0 matching result(s). No activities found.</main>",
        });
      }
    });
    return context;
  });
  try {
    await assert.rejects(
      browser.lookupVotingPlace({
        type: "address",
        address: "Controlled public example",
      }),
      (error: unknown) =>
        error instanceof CityLookupError && error.code === "redirected",
    );
    const fallback = await browser.open(CITY_ENTRY_POINTS.recreationGuide);
    assert.equal(fallback.url, CITY_ENTRY_POINTS.recreation);
    assert.equal(fallback.recovery?.sourceUrl, CITY_ENTRY_POINTS.recreationGuide);
    assert.match(
      browser.observations.get(fallback.recovery?.observationId ?? "")?.text ?? "",
      /maintenance/,
    );
    const recovered = await browser.open(
      CITY_ENTRY_POINTS.electionGuide + "?transient=1",
    );
    assert.match(recovered.text, /recovered/);
    assert.equal(transientReads, 2);
    await assert.rejects(
      browser.open(CITY_ENTRY_POINTS.electionGuide + "?challenge=1"),
      (error: unknown) =>
        error instanceof CityLookupError && error.code === "human_verification",
    );
    assert.equal(challengeReads, 1);
  } finally {
    await browser.close();
    await runtime.close();
  }
});

test("failed public tools return actionable results and never count as checked evidence", async () => {
  const session = getSession(null);
  assert.ok(session);
  session.browser.open = async () => {
    throw new CityLookupError("human_verification");
  };
  try {
    const execute = createCityAgent(session).tools.browserOpen.execute;
    assert.ok(execute);
    const output = await execute(
      { url: CITY_ENTRY_POINTS.recreation },
      { toolCallId: "fixture", messages: [], context: undefined },
    );
    assert.equal(lookupFailureFromOutput(output)?.code, "human_verification");
    assert.ok("status" in output);
    const sources = messageSources({
      id: "fixture",
      role: "assistant",
      parts: [
        {
          type: "tool-browserOpen",
          toolCallId: "fixture",
          state: "output-available",
          input: { url: CITY_ENTRY_POINTS.recreation },
          output,
        },
      ],
    });
    assert.equal(sources.sources.length, 0);
  } finally {
    await removeSession(session);
  }
});
