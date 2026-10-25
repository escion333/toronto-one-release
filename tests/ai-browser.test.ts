import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  allowedActions,
  addressSuggestionAllowed,
  approvedPageUrl,
  normalizeCityLink,
  sameOrigin,
  verifyQuotes,
  type BrowserControl,
} from "../src/lib/ai/policy.ts";
import { CityBrowser, type Observation } from "../src/lib/ai/browser.ts";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import {
  agentMascotState,
  cityResultSchema,
  type CityResult,
} from "../src/lib/ai/contracts.ts";
import {
  approvedBookingPlan,
  getSession,
  makeBookingPlan,
  removeSession,
  sessionCookie,
  SESSION_COOKIE,
  SESSION_TTL,
  type AgentSession,
} from "../src/lib/ai/session.ts";
import { publicAIError } from "../src/lib/ai/errors.ts";

// These are owned contract fixtures, not City responses or production transactions.
const detailUrl =
  "https://anc.ca.apm.activecommunities.com/toronto/activity/search/detail/195158";
function result(): CityResult {
  return {
    id: randomUUID(),
    kind: "recreation",
    title: "Controlled fixture activity",
    sourceUrl: detailUrl,
    checkedAt: new Date().toISOString(),
    facts: [
      { label: "Source excerpt", quote: "Controlled fixture, not live inventory." },
    ],
    status: "requires_official_booking",
  };
}
function observation(url = detailUrl, text = result().facts[0]!.quote): Observation {
  return {
    id: randomUUID(),
    url,
    title: "Controlled test fixture",
    checkedAt: new Date().toISOString(),
    text,
    controls: [],
  };
}
function control(patch: Partial<BrowserControl> = {}): BrowserControl {
  return {
    ref: "c1",
    tag: "button",
    role: "",
    name: "Search",
    field: "",
    href: null,
    type: "button",
    ...patch,
  };
}
function newSession(): AgentSession {
  const session = getSession(null);
  assert.ok(session);
  return session;
}

test("public navigation accepts the two reviewed City services, rejects identity and transaction surfaces", () => {
  for (const url of [
    "https://myvote.toronto.ca/home",
    "https://myvote.toronto.ca/hub",
    "https://myvote.toronto.ca/votingplace",
    "https://www.toronto.ca/city-government/elections/",
    "https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/sports/drop-in-sports-map/",
    "https://anc.ca.apm.activecommunities.com/toronto/activity/search?activity_keyword=badminton",
    detailUrl,
  ])
    assert.equal(new URL(approvedPageUrl(url)).protocol, "https:");
  for (const url of [
    "http://myvote.toronto.ca/home",
    "https://user:password@myvote.toronto.ca/home",
    "https://myvote.toronto.ca:8443/home",
    "https://myvote.toronto.ca.evil.example/home",
    "https://myvote.toronto.ca/voterslist/lookup",
    "https://myvote.toronto.ca/mailinvoting/status",
    "https://anc.ca.apm.activecommunities.com/another-city/activity/search",
    "https://anc.ca.apm.activecommunities.com/toronto/newcart",
    "https://anc.ca.apm.activecommunities.com/toronto/signin",
    "https://www.toronto.ca/home/311-toronto-at-your-service/",
    "https://127.0.0.1/",
    "file:///etc/passwd",
  ])
    assert.throws(() => approvedPageUrl(url), { name: "Error" }, url);
});

test("legacy activity links normalize within Toronto without enabling other tenants or hosts", () => {
  assert.equal(
    normalizeCityLink(
      "https://ca.apm.activecommunities.com/toronto/Activity_Search/example/195158?locale=en-US",
      detailUrl,
    ),
    detailUrl,
  );
  assert.equal(
    normalizeCityLink("/votingplace", "https://myvote.toronto.ca/hub"),
    "https://myvote.toronto.ca/votingplace",
  );
  for (const link of [
    "https://ca.apm.activecommunities.com/another-city/Activity_Search/example/195158",
    "https://evil.example/toronto/activity/search",
    "https://myvote.toronto.ca/voterslist/lookup",
    "javascript:alert(1)",
  ])
    assert.equal(normalizeCityLink(link, detailUrl), null);
});

test("application actions permit public lookup, not enrollment, credentials or waiver acceptance", () => {
  const vote = "https://myvote.toronto.ca/home";
  assert.deepEqual(
    allowedActions(vote, control({ tag: "input", type: "text", field: "Address" })),
    ["fill"],
  );
  assert.deepEqual(allowedActions(vote, control({ tag: "div", role: "option" })), [
    "click",
  ]);
  assert.deepEqual(allowedActions(vote, control({ name: "Go" })), ["click"]);
  assert.deepEqual(
    allowedActions(
      detailUrl,
      control({ tag: "input", field: "activity-cascaded-search-input", type: "text" }),
    ),
    ["fill"],
  );
  for (const name of [
    "Enroll Now",
    "16 openings remaining Enroll Now",
    "Add to Cart",
    "Checkout",
    "Sign In",
    "Agree to waiver",
    "Add to My Wish List",
  ]) {
    assert.deepEqual(allowedActions(detailUrl, control({ name })), [], name);
  }
  assert.deepEqual(
    allowedActions(
      detailUrl,
      control({ tag: "input", type: "password", field: "password" }),
    ),
    [],
  );
  assert.deepEqual(
    allowedActions(vote, control({ tag: "input", field: "DateOfBirth", type: "text" })),
    [],
  );
});

test("stale or unobserved browser references fail before starting a browser", async () => {
  const browser = new CityBrowser();
  try {
    await assert.rejects(browser.act(randomUUID(), "c1", "click"), /stale|observe/i);
  } finally {
    await browser.close();
  }
});

test("browser operations serialize and a rejected operation does not wedge later work", async () => {
  const browser = new CityBrowser();
  const order: string[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = browser.run(async () => {
    order.push("first-start");
    await gate;
    order.push("first-end");
  });
  const second = browser.run(async () => {
    order.push("second");
  });
  await Promise.resolve();
  assert.deepEqual(order, ["first-start"]);
  assert.ok(release);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
  await assert.rejects(
    browser.run(async () => {
      throw new Error("Controlled failure");
    }),
  );
  assert.equal(await browser.run(async () => "recovered"), "recovered");
  await browser.close();
});

test("evidence support rejects invented availability and unrelated quotes", () => {
  verifyQuotes("Fixture\nactivity\tFull", ["Fixture activity", "Full"]);
  assert.throws(() => verifyQuotes("Fixture activity Full", ["Available"]));
  assert.throws(() =>
    verifyQuotes("Fixture activity Full", [
      "Fixture activity",
      "Confirmed reservation",
    ]),
  );
  assert.throws(() => verifyQuotes("Fixture activity Full", []));
  assert.throws(() => verifyQuotes("Fixture activity Full", [" "]));
});

test("result publication requires observed excerpts, the correct surface and a fresh observation", async () => {
  const session = newSession();
  try {
    const publish = createCityAgent(session).tools.publishResult.execute;
    assert.ok(publish);
    const options = { toolCallId: randomUUID(), messages: [], context: undefined };
    const observed = observation();
    session.browser.observations.set(observed.id, observed);
    const input = {
      kind: "recreation" as const,
      observationId: observed.id,
      facts: result().facts,
    };
    const published = cityResultSchema.parse(await publish(input, options));
    assert.equal(published.status, "requires_official_booking");
    assert.equal(published.sourceUrl, detailUrl);
    assert.equal(published.checkedAt, observed.checkedAt);
    assert.ok(published.plan);
    await assert.rejects(async () =>
      publish({ ...input, observationId: randomUUID() }, options),
    );
    await assert.rejects(async () =>
      publish(
        {
          ...input,
          facts: [{ label: "Source excerpt", quote: "Invented booking confirmation" }],
        },
        options,
      ),
    );
    const listing = observation(
      "https://anc.ca.apm.activecommunities.com/toronto/activity/search",
    );
    session.browser.observations.set(listing.id, listing);
    await assert.rejects(async () =>
      publish({ ...input, observationId: listing.id }, options),
    );
    await assert.rejects(async () => publish({ ...input, kind: "voting" }, options));
    const expired = {
      ...observed,
      id: randomUUID(),
      checkedAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    };
    session.browser.observations.set(expired.id, expired);
    await assert.rejects(async () =>
      publish({ ...input, observationId: expired.id }, options),
    );
  } finally {
    await removeSession(session);
  }
});

test("handoff approval is bound to a server plan, session, digest, expiry and one-time use", () => {
  const now = Date.now();
  const plan = makeBookingPlan(result(), now);
  const owner = { plans: new Map([[plan.id, plan]]) };
  assert.equal(approvedBookingPlan(owner, plan.id, plan.digest, now + 1).id, plan.id);
  assert.throws(() =>
    approvedBookingPlan({ plans: new Map() }, plan.id, plan.digest, now + 1),
  );
  assert.throws(() => approvedBookingPlan(owner, randomUUID(), plan.digest, now + 1));
  assert.throws(() => approvedBookingPlan(owner, plan.id, "0".repeat(64), now + 1));
  assert.throws(() => approvedBookingPlan(owner, plan.id, plan.digest, plan.expiresAt));
  plan.consumed = true;
  assert.throws(() => approvedBookingPlan(owner, plan.id, plan.digest, now + 1));
  const changed = makeBookingPlan(result(), now);
  changed.result.facts[0]!.quote = "Changed after the preview was approved.";
  assert.throws(() =>
    approvedBookingPlan(
      { plans: new Map([[changed.id, changed]]) },
      changed.id,
      changed.digest,
      now + 1,
    ),
  );
});

test("a handoff preview is an immutable snapshot, not a mutable alias to the published result", () => {
  const original = result();
  const plan = makeBookingPlan(original);
  const expected = original.facts[0]!.quote;
  try {
    original.facts[0]!.quote = "Changed after review";
  } catch {
    /* A frozen original is also safe. */
  }
  assert.equal(plan.result.facts[0]!.quote, expected);
});

test("session IDs are server-generated, isolated, expiring and revocable", async () => {
  const forged = randomUUID();
  const first = getSession(`${SESSION_COOKIE}=${forged}`);
  const second = newSession();
  assert.ok(first);
  try {
    assert.notEqual(first.id, forged);
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.browser, second.browser);
    assert.notEqual(first.plans, second.plans);
    assert.equal(getSession(`${SESSION_COOKIE}=${first.id}`, false), first);
    const cookie = sessionCookie(first, true);
    for (const flag of ["HttpOnly", "SameSite=Strict", "Secure", "Path=/"])
      assert.ok(cookie.includes(flag));
    first.touchedAt = Date.now() - SESSION_TTL - 1;
    assert.equal(getSession(`${SESSION_COOKIE}=${first.id}`, false), undefined);
    assert.equal(getSession(`${SESSION_COOKIE}=${second.id}`, false), second);
  } finally {
    await removeSession(first);
    await removeSession(second);
  }
  assert.equal(getSession(`${SESSION_COOKIE}=${second.id}`, false), undefined);
});

test("cross-origin requests are refused and public errors never expose provider details", () => {
  const url = "http://localhost:3000/api/chat";
  assert.equal(
    sameOrigin(new Request(url, { headers: { origin: "https://evil.example" } })),
    false,
  );
  assert.equal(
    sameOrigin(new Request(url, { headers: { "sec-fetch-site": "cross-site" } })),
    false,
  );
  assert.equal(
    sameOrigin(new Request(url, { headers: { origin: "http://localhost:3000" } })),
    true,
  );
  const detail = "fixture-secret-value-that-must-not-leak";
  for (const error of [
    new Error(detail),
    { statusCode: 403, message: detail },
    { statusCode: 429, message: detail },
  ]) {
    assert.ok(!publicAIError(error).includes(detail));
  }
  assert.match(
    publicAIError(
      new Error(
        "Free tier users do not have access to this model. Upgrade to paid credits",
      ),
    ),
    /purchased AI Gateway credits/,
  );
});

test("raccoon states follow genuine stream/tool/result/input/error events", () => {
  const idle = {
    status: "ready",
    focused: false,
    toolRunning: false,
    needsInput: false,
    hasResult: false,
    toolFailed: false,
  };
  assert.equal(agentMascotState(idle), "idle");
  assert.equal(agentMascotState({ ...idle, focused: true }), "listening");
  assert.equal(agentMascotState({ ...idle, status: "submitted" }), "thinking");
  assert.equal(
    agentMascotState({ ...idle, status: "streaming", toolRunning: true }),
    "working",
  );
  assert.equal(agentMascotState({ ...idle, needsInput: true }), "needs_input");
  assert.equal(agentMascotState({ ...idle, hasResult: true }), "success");
  assert.equal(agentMascotState({ ...idle, status: "error" }), "error");
  assert.equal(agentMascotState({ ...idle, toolFailed: true }), "error");
});

test("multiple address suggestions require one exact requested street, preserving directions and ambiguity", () => {
  const names = ["100 QUEEN ST E", "100 QUEEN ST W"];
  assert.equal(
    addressSuggestionAllowed("100 Queen Street West", names[1]!, names),
    true,
  );
  assert.equal(
    addressSuggestionAllowed("100 Queen Street West", names[0]!, names),
    false,
  );
  assert.equal(addressSuggestionAllowed("100 Queen", names[1]!, names), false);
  assert.equal(addressSuggestionAllowed(undefined, names[1]!, names), false);
  assert.equal(
    addressSuggestionAllowed("100 Queen St W", names[1]!, [names[1]!, names[1]!]),
    false,
  );
});
