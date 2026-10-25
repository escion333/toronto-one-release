import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";
import { getSession, removeSession } from "../src/lib/ai/session.ts";

test("activity centre evidence joins only a fresh listing record linking the exact detail", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    const url =
      "https://anc.ca.apm.activecommunities.com/toronto/activity/search/detail/195289";
    const observed = {
      id: randomUUID(),
      url,
      title: "Fixture detail",
      checkedAt: new Date().toISOString(),
      text: "Fixture activity. Full. Gymnasium.",
      controls: [],
    };
    session.browser.observations.set(observed.id, observed);
    const publish = createCityAgent(session).tools.publishResult.execute;
    assert.ok(publish);
    const input = {
      kind: "recreation" as const,
      observationId: observed.id,
      facts: [{ label: "Availability", quote: "Full" }],
    };
    const options = { toolCallId: randomUUID(), messages: [], context: undefined };
    const listingUrl =
      "https://anc.ca.apm.activecommunities.com/toronto/activity/search?center_ids=1330&viewMode=list";
    const listing = {
      id: randomUUID(),
      url: listingUrl,
      title: "Fixture listing",
      checkedAt: new Date().toISOString(),
      text: "Fixture activity at Canoe Landing. Full.",
      controls: [
        {
          ref: "c1",
          tag: "a",
          role: "link",
          name: "Fixture activity",
          field: "",
          type: "",
          href: url.replace("195289", "195290"),
          context: "Fixture activity at Canoe Landing. Full.",
          actions: ["click" as const],
        },
      ],
    };
    session.browser.observations.set(listing.id, listing);
    const unrelated = cityResultSchema.parse(await publish(input, options));
    assert.equal(
      unrelated.facts.length,
      1,
      "Same title cannot join a different activity.",
    );
    listing.controls[0]!.href = url;
    listing.checkedAt = new Date(Date.now() - 6 * 60_000).toISOString();
    const stale = cityResultSchema.parse(await publish(input, options));
    assert.equal(stale.facts.length, 1, "Stale listing evidence cannot be added.");
    listing.checkedAt = new Date().toISOString();
    const matched = cityResultSchema.parse(await publish(input, options));
    assert.equal(matched.facts.length, 2);
    assert.equal(matched.facts[1]?.sourceUrl, listingUrl);
    assert.equal(matched.facts[1]?.quote, listing.text);
  } finally {
    await removeSession(session);
  }
});
