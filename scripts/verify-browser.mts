/**
 * Public-site smoke test of the shared executor, not proof of model autonomy.
 * Uses the City's published MyVote example; never reads registration records or
 * clicks enrollment, authentication, cart, waiver or checkout controls.
 * Run: node scripts/verify-browser.mts
 */
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import {
  CityBrowser,
  closeBrowserRuntime,
  type Observation,
} from "../src/lib/ai/browser.ts";
import { CITY_ENTRY_POINTS } from "../src/lib/ai/policy.ts";

type Control = Observation["controls"][number];
const browser = new CityBrowser();
const started = Date.now();
let actions = 0;
let stage = "start";

function one(observation: Observation, matches: (control: Control) => boolean) {
  const controls = observation.controls.filter(matches);
  assert.equal(controls.length, 1, `Expected one unambiguous control during ${stage}`);
  const control = controls[0];
  assert.ok(control);
  return control;
}
async function act(
  observation: Observation,
  control: Control,
  action: "fill" | "click",
  value?: string,
) {
  actions++;
  return browser.run(() => browser.act(observation.id, control.ref, action, value));
}
async function until(
  observation: Observation,
  ready: (current: Observation) => boolean,
) {
  let current = observation;
  for (let attempt = 0; attempt < 12 && !ready(current); attempt++) {
    await pause(1000);
    current = await browser.run(() => browser.observe());
  }
  assert.ok(ready(current), `Official page did not settle during ${stage}`);
  return current;
}

try {
  stage = "MyVote address input";
  let observed = await browser.run(() => browser.open(CITY_ENTRY_POINTS.voting));
  observed = await act(
    observed,
    one(observed, (c) => c.field === "Address"),
    "fill",
    "63 Commissioners St",
  );
  stage = "MyVote address suggestion";
  observed = await until(observed, (o) => o.controls.some((c) => c.role === "option"));
  const suggestion = one(observed, (c) => c.role === "option");
  assert.match(suggestion.name, /^63\s+COMMISSIONERS\s+ST(?:REET)?\b/i);
  observed = await act(observed, suggestion, "click");
  observed = await act(
    observed,
    one(observed, (c) => c.name === "Go"),
    "click",
  );
  stage = "MyVote assigned voting place";
  observed = await until(observed, (o) =>
    o.controls.some((c) => c.href === "https://myvote.toronto.ca/votingplace"),
  );
  observed = await act(
    observed,
    one(observed, (c) => c.href === "https://myvote.toronto.ca/votingplace"),
    "click",
  );
  observed = await until(observed, (o) =>
    /Election Day[\s\S]*Voting Place|Election Day Voting Location/i.test(o.text),
  );
  assert.equal(new URL(observed.url).pathname, "/votingplace");
  assert.match(observed.text, /October 26/i);
  assert.match(observed.text, /Ralph Thornton Community Centre/i);
  console.log(
    JSON.stringify({
      workflow: "voting",
      status: "live_public_example_lookup",
      sourceUrl: observed.url,
      checkedAt: observed.checkedAt,
      assignedPlaceVerified: true,
      registrationChecked: false,
    }),
  );

  stage = "recreation live search";
  observed = await browser.run(() => browser.open(CITY_ENTRY_POINTS.recreation));
  observed = await act(
    observed,
    one(observed, (c) => c.field === "activity-cascaded-search-input"),
    "fill",
    "badminton",
  );
  observed = await act(
    observed,
    one(observed, (c) => c.name === "Search"),
    "click",
  );
  stage = "recreation matching activities";
  observed = await until(observed, (o) =>
    o.controls.some(
      (c) => /badminton/i.test(c.name) && /\/detail\/\d+$/.test(c.href ?? ""),
    ),
  );
  const activities = observed.controls.filter(
    (c) => /badminton/i.test(c.name) && /\/detail\/\d+$/.test(c.href ?? ""),
  );
  // First matching public detail is sufficient to test the executor, not a
  // recommendation, preference match or claim that any spot is bookable.
  const activity = activities[0];
  assert.ok(activity);
  observed = await act(observed, activity, "click");
  stage = "recreation live activity detail";
  observed = await until(observed, (o) => /Activity meeting dates/i.test(o.text));
  assert.match(
    new URL(observed.url).pathname,
    /^\/toronto\/activity\/search\/detail\/\d+$/,
  );
  assert.match(observed.text, /badminton/i);
  console.log(
    JSON.stringify({
      workflow: "recreation",
      status: "live_public_activity_detail",
      sourceUrl: observed.url,
      checkedAt: observed.checkedAt,
      matchingLinksObserved: activities.length,
      bookingAttempted: false,
      receiptVerified: false,
    }),
  );
  console.log(
    JSON.stringify({
      status: "passed",
      scope: "shared_executor_only_not_model_autonomy",
      elapsedMs: Date.now() - started,
      actions,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "failed",
      stage,
      reason: error instanceof Error ? error.message : "Unknown executor failure",
    }),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
  await closeBrowserRuntime();
}
