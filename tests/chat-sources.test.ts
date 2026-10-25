import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { CityUIMessage } from "../src/lib/ai/agent.ts";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { citeObservation } from "../src/lib/ai/citations.ts";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";
import { groupSources, messageSources, resultSources } from "../src/lib/ai/sources.ts";
import { getSession, removeSession } from "../src/lib/ai/session.ts";
import type { Observation } from "../src/lib/ai/browser.ts";

// Owned contract fixtures only; no live inventory or resident records.
const checkedAt = "2026-10-25T09:46:00.000Z";
const now = Date.parse(checkedAt) + 1000;
const url = "https://myvote.toronto.ca/home";
function observation(patch: Partial<Observation> = {}): Observation {
  return {
    id: randomUUID(),
    url,
    title: "Observed fixture page",
    checkedAt,
    text: "Controlled public page excerpt. Another controlled excerpt.",
    controls: [],
    ...patch,
  };
}
const excerpts = [{ label: "Guidance", quote: "Controlled public page excerpt." }];
function message(parts: CityUIMessage["parts"]): CityUIMessage {
  return { id: randomUUID(), role: "assistant", parts };
}

test("citations bind exact excerpts to observed URL, title and time, rejecting invented or stale evidence", () => {
  const observed = observation();
  const cited = citeObservation(observed, excerpts, now);
  assert.equal(cited.url, url);
  assert.equal(cited.title, observed.title);
  assert.equal(cited.checkedAt, checkedAt);
  assert.equal(cited.observationId, observed.id);
  assert.deepEqual(cited.excerpts, excerpts);
  assert.throws(() => citeObservation(undefined, excerpts, now));
  assert.throws(() => citeObservation(observed, excerpts, now + 6 * 60_000));
  assert.throws(() =>
    citeObservation(observation({ checkedAt: "invalid" }), excerpts, now),
  );
  assert.throws(() =>
    citeObservation(observation({ url: "javascript:alert(1)" }), excerpts, now),
  );
  assert.throws(() =>
    citeObservation(observation({ url: "https://evil.example/" }), excerpts, now),
  );
  assert.throws(() =>
    citeObservation(observed, [{ label: "Invented", quote: "Booked!" }], now),
  );
});

test("four successful browser steps count as one unique page; incomplete and failed tools add no sources", () => {
  const observed = observation();
  const parts: CityUIMessage["parts"] = Array.from({ length: 4 }, () => ({
    type: "tool-browserObserve",
    toolCallId: randomUUID(),
    state: "output-available",
    input: {},
    output: { ...observed, id: randomUUID() },
  }));
  parts.push(
    {
      type: "tool-browserOpen",
      toolCallId: randomUUID(),
      state: "input-available",
      input: { url },
    },
    {
      type: "tool-browserOpen",
      toolCallId: randomUUID(),
      state: "output-error",
      input: { url },
      errorText: "Controlled failure",
    },
  );
  const sources = messageSources(message(parts));
  assert.equal(sources.kind, "checked");
  assert.equal(sources.sources.length, 1);
  assert.equal(sources.sources[0]?.observations.length, 1);
  assert.deepEqual(sources.sources[0]?.observations[0]?.excerpts, []);
  assert.equal(messageSources(message(parts.slice(-2))).sources.length, 0);
});

test("sources used include cited evidence only, merging repeated citations without replacing excerpt timestamps", () => {
  const observed = observation();
  const first = citeObservation(observed, excerpts, now);
  const second = citeObservation(
    observation({ checkedAt: "2026-10-25T09:47:00.000Z" }),
    [{ label: "Other", quote: "Another controlled excerpt." }],
    now + 60_000,
  );
  const parts: CityUIMessage["parts"] = [
    {
      type: "tool-browserObserve",
      toolCallId: randomUUID(),
      state: "output-available",
      input: {},
      output: observation({ url: "https://myvote.toronto.ca/hub" }),
    },
    ...[first, first, second].map((output) => ({
      type: "tool-citeSource" as const,
      toolCallId: randomUUID(),
      state: "output-available" as const,
      input: { observationId: output.observationId, excerpts: output.excerpts },
      output,
    })),
  ];
  const view = messageSources(message(parts));
  assert.equal(view.kind, "used");
  assert.equal(view.sources.length, 1);
  assert.equal(view.sources[0]?.observations.length, 2);
  assert.deepEqual(
    view.sources[0]?.observations.map((o) => o.checkedAt),
    [first.checkedAt, second.checkedAt],
  );
  assert.equal(view.sources[0]?.observations[0]?.excerpts.length, 1);
  assert.equal(
    first.excerpts.length,
    1,
    "Grouping must not mutate retained tool output",
  );
  assert.deepEqual(
    messageSources(JSON.parse(JSON.stringify(message(parts)))),
    view,
    "Restored conversations keep citation metadata",
  );
});

test("unique-page grouping preserves distinct listing filters and activity IDs, rejecting unsafe links", () => {
  const base = "https://anc.ca.apm.activecommunities.com/toronto/activity/search";
  const evidence = [
    `${base}?viewMode=list&activity_keyword=badminton`,
    `${base}/?activity_keyword=badminton&viewMode=list#top`,
    `${base}?viewMode=list&activity_keyword=swimming`,
    `${base}/detail/1`,
    `${base}/detail/2`,
    "https://evil.example/",
    "javascript:alert(1)",
    "https://myvote.toronto.ca/voterslist/lookup",
  ].map((url) => ({
    observationId: randomUUID(),
    url,
    title: "",
    checkedAt,
    excerpts,
  }));
  const sources = groupSources(evidence);
  assert.equal(sources.length, 4);
  assert.equal(sources[0]?.observations.length, 2);
  assert.equal(sources[0]?.title, "anc.ca.apm.activecommunities.com");
});

test("published results retain each supporting page's own title, excerpts and check time", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    const detail = observation({
      url: "https://anc.ca.apm.activecommunities.com/toronto/activity/search/detail/1",
      checkedAt: new Date().toISOString(),
    });
    const listing = observation({
      url: "https://anc.ca.apm.activecommunities.com/toronto/activity/search?viewMode=list",
      title: "Observed listing title",
      checkedAt: new Date(Date.now() - 30_000).toISOString(),
      text: "Controlled linked listing context.",
      controls: [
        {
          ref: "c1",
          tag: "a",
          role: "",
          name: "Fixture activity",
          field: "",
          href: detail.url,
          type: "",
          context: "Controlled linked listing context.",
          actions: ["click"],
        },
      ],
    });
    for (const observed of [listing, detail])
      session.browser.observations.set(observed.id, observed);
    const agent = createCityAgent(session);
    const options = { toolCallId: randomUUID(), messages: [], context: undefined };
    const publish = agent.tools.publishResult.execute;
    const cite = agent.tools.citeSource.execute;
    assert.ok(publish);
    assert.ok(cite);
    const result = cityResultSchema.parse(
      await publish(
        {
          kind: "recreation",
          observationId: detail.id,
          facts: excerpts.map((e) => ({ ...e })),
        },
        options,
      ),
    );
    assert.equal(result.sources?.length, 2);
    assert.equal(result.sources[0]?.title, detail.title);
    assert.equal(result.sources[0]?.excerpts.length, 1);
    assert.equal(result.sources[1]?.url, listing.url);
    assert.equal(result.sources[1]?.checkedAt, listing.checkedAt);
    assert.equal(result.sources[1]?.title, listing.title);
    assert.deepEqual(result.sources[1]?.excerpts, [
      { label: "Linked activity listing", quote: listing.text },
    ]);
    const part: CityUIMessage["parts"][number] = {
      type: "tool-publishResult",
      toolCallId: randomUUID(),
      state: "output-available",
      input: { kind: "recreation", observationId: detail.id, facts: excerpts },
      output: result,
    };
    assert.equal(messageSources(message([part])).sources.length, 2);
    await assert.rejects(async () =>
      cite({ observationId: randomUUID(), excerpts }, options),
    );
    const cited = await cite({ observationId: detail.id, excerpts }, options);
    assert.deepEqual(cited, result.sources[0]);
  } finally {
    await removeSession(session);
  }
});

test("legacy result excerpts keep their source association without inventing a linked page check time", () => {
  const linked = "https://myvote.toronto.ca/hub";
  const result = cityResultSchema.parse({
    id: randomUUID(),
    kind: "guidance",
    title: "Fixture",
    sourceUrl: url,
    checkedAt,
    facts: [
      ...excerpts,
      { label: "Linked", quote: "Linked excerpt", sourceUrl: linked },
    ],
    status: "information_found",
  });
  const sources = groupSources(resultSources(result));
  assert.equal(sources.length, 2);
  assert.equal(sources[0]?.observations[0]?.checkedAt, checkedAt);
  assert.equal(sources[1]?.observations[0]?.checkedAt, undefined);
  assert.equal(sources[1]?.observations[0]?.excerpts[0]?.quote, "Linked excerpt");
});
