import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  intersectionStreets,
  normalizeStreet,
  resolveVotingIntersection,
  votingVenue,
} from "../src/lib/ai/voting.ts";
import { votingMapLinks } from "../src/lib/voting-map.ts";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { cityResultSchema } from "../src/lib/ai/contracts.ts";
import { getSession, removeSession, SESSION_COOKIE } from "../src/lib/ai/session.ts";

// Owned contract fixtures; no City responses or resident records are persisted.
const point = { x: -79.4, y: 43.65 };
function feature(attributes: Record<string, unknown>, geometry = point) {
  return { attributes, geometry };
}
function locationService({
  ambiguous = false,
  far = false,
  unavailable = false,
  divided = false,
  libraryNameOnly = false,
} = {}) {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url);
    assert.ok(
      ["https://gis.toronto.ca", "https://services3.arcgis.com"].includes(url.origin),
    );
    if (unavailable) return Response.json({ error: { code: 503 } });
    if (url.pathname.includes("COTGEO_CENTRELINE_INTERSECTION/FeatureServer/0/query"))
      return Response.json({
        features: [
          feature({
            INTERSECTION_ID: 1,
            INTERSECTION_DESC: "Fixture St / Example Ave W",
          }),
          ...(divided
            ? [
                feature(
                  {
                    INTERSECTION_ID: 4,
                    INTERSECTION_DESC: "Fixture St / Example Ave W",
                  },
                  { x: -79.4007, y: 43.65 },
                ),
              ]
            : []),
          ...(ambiguous
            ? [
                feature(
                  {
                    INTERSECTION_ID: 2,
                    INTERSECTION_DESC: "Fixture St / Example Ave E",
                  },
                  { x: -79.41, y: 43.65 },
                ),
              ]
            : []),
        ],
      });
    if (url.pathname.includes("/28/query"))
      return Response.json({
        features: [
          feature(
            {
              OBJECTID: 1,
              PLACE_NAME: libraryNameOnly ? null : "Fixture Public Library",
              LIBRARY_NAME: "Fixture",
              ADDRESS_FULL: "100 Example Ave W",
            },
            { x: far ? -79.5 : -79.401, y: 43.65 },
          ),
          // The closest row without a civic street address cannot be substituted.
          feature({
            OBJECTID: 2,
            PLACE_NAME: "Invalid address",
            ADDRESS_FULL: "Example Park",
          }),
        ],
      });
    return Response.json({
      features: [
        feature(
          {
            OBJECTID: 3,
            PUBLIC_NAME: "Fixture Civic Centre",
            ADDRESS: "200 Example Ave W,",
          },
          { x: -79.405, y: 43.65 },
        ),
      ],
    });
  };
  return { calls, fetcher };
}

test("intersection parsing supports common separators and rejects ambiguous or query-like input", () => {
  for (const value of [
    "Fixture & Example",
    "Fixture and Example",
    "Fixture at Example",
    "Fixture / Example",
    "Fixture @ Example, Toronto",
  ])
    assert.deepEqual(intersectionStreets(value), ["Fixture", "Example"]);
  for (const value of [
    "Fixture",
    "Fixture & Fixture",
    "A & B & C",
    "A% & B",
    "A;DROP & B",
    "A & ",
  ])
    assert.throws(() => intersectionStreets(value));
  assert.equal(
    normalizeStreet("100 Example Avenue West, Toronto"),
    "100 EXAMPLE AVE W",
  );
});

test("intersection lookup selects a verified nearby public address and preserves separate source records", async () => {
  const service = locationService();
  const lookup = await resolveVotingIntersection(
    "Example Ave W & Fixture Street",
    service.fetcher,
  );
  assert.equal(lookup.type, "intersection");
  if (lookup.type !== "intersection") assert.fail("Expected intersection metadata");
  assert.equal(lookup.address, "100 Example Ave W");
  assert.equal(lookup.publicPlace, "Fixture Public Library");
  assert.equal(lookup.intersection, "Fixture St / Example Ave W");
  assert.ok(lookup.distanceMetres > 50 && lookup.distanceMetres < 150);
  assert.equal(new URL(lookup.publicPlaceSourceUrl).searchParams.get("objectIds"), "1");
  assert.equal(service.calls.length, 4);
  assert.equal(service.calls[1]?.searchParams.get("distance"), "1500");
});

test("intersection lookup stops for ambiguity and unverified data, and enforces distance independently", async () => {
  const ambiguous = locationService({ ambiguous: true });
  await assert.rejects(
    resolveVotingIntersection("Fixture & Example", ambiguous.fetcher),
    /Several intersections match/,
  );
  assert.equal(
    ambiguous.calls.length,
    1,
    "Do not select a facility for an ambiguous intersection",
  );
  await assert.rejects(
    resolveVotingIntersection(
      "Fixture & Example",
      locationService({ unavailable: true }).fetcher,
    ),
    /could not be verified/,
  );
  const far = await resolveVotingIntersection(
    "Fixture & Example",
    locationService({ far: true }).fetcher,
  );
  assert.equal(
    far.address,
    "200 Example Ave W",
    "Ignore a library outside the requested distance even if the server returns it",
  );
  const empty: typeof fetch = async () => Response.json({ features: [] });
  await assert.rejects(
    resolveVotingIntersection("Fixture & Example", empty),
    /No unambiguous/,
  );
});

test("divided-street points form one crossing and library records can use their published library name", async () => {
  const lookup = await resolveVotingIntersection(
    "Fixture & Example",
    locationService({ divided: true, libraryNameOnly: true }).fetcher,
  );
  assert.equal(lookup.type, "intersection");
  if (lookup.type !== "intersection") assert.fail("Expected example lookup");
  assert.equal(lookup.publicPlace, "Fixture Public Library");
  assert.equal(lookup.address, "100 Example Ave W");
});

test("omitted street directions and multiway intersections resolve without guessing between distinct crossings", async () => {
  const simple = await resolveVotingIntersection(
    "Fixture St & Example Ave",
    locationService().fetcher,
  );
  assert.equal(simple.address, "100 Example Ave W");
  const service = locationService();
  const multiway: typeof fetch = async (input, init) => {
    if (new URL(String(input)).pathname.includes("COTGEO_CENTRELINE_INTERSECTION"))
      return Response.json({
        features: [
          feature({
            INTERSECTION_ID: 1,
            INTERSECTION_DESC: "Fixture St / Example Ave W / Example Ave E",
          }),
        ],
      });
    return service.fetcher(input, init);
  };
  assert.equal(
    (await resolveVotingIntersection("Fixture St & Example Ave", multiway)).address,
    "100 Example Ave W",
  );
  await assert.rejects(
    resolveVotingIntersection(
      "Fixture St & Example Ave",
      locationService({ ambiguous: true }).fetcher,
    ),
    /Several intersections/,
  );
});

test("map destination comes from the venue field, and missing or ambiguous venue data is omitted", () => {
  const text =
    "100 Example Ave W, Toronto\nElection Day\nLocation\nFixture Voting Hall\nAddress\n200 Venue St\nPreferred Entrance:\nMain Doors";
  const venue = votingVenue(text);
  assert.deepEqual(venue, { name: "Fixture Voting Hall", address: "200 Venue St" });
  assert.ok(venue);
  const links = votingMapLinks(venue.address);
  assert.equal(new URL(links.embed).origin, "https://www.google.com");
  assert.equal(
    new URL(links.embed).searchParams.get("q"),
    "200 Venue St, Toronto, Ontario, Canada",
  );
  assert.ok(!links.embed.includes("100+Example"));
  assert.equal(
    new URL(links.external).searchParams.get("query"),
    new URL(links.embed).searchParams.get("q"),
  );
  assert.equal(votingVenue("Address\n100 Example Ave W"), undefined);
  assert.equal(votingVenue(`${text}\nAddress\n300 Other St`), undefined);
  const named = votingMapLinks("200 Venue St", "Fixture Voting Hall, Room 2");
  assert.equal(
    new URL(named.embed).searchParams.get("q"),
    "Fixture Voting Hall, 200 Venue St, Toronto, Ontario, Canada",
  );
  assert.ok(!named.embed.includes("Room"));
});

test("voting publication requires browser-bound context and derives the example label outside the model", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    const publish = createCityAgent(session).tools.publishResult.execute;
    assert.ok(publish);
    const observed = {
      id: randomUUID(),
      url: "https://myvote.toronto.ca/votingplace",
      title: "Fixture voting result",
      checkedAt: new Date().toISOString(),
      text: "Fixture Voting Hall",
      controls: [],
    };
    session.browser.observations.set(observed.id, observed);
    const input = {
      kind: "voting" as const,
      observationId: observed.id,
      facts: [{ label: "Location", quote: "Fixture Voting Hall" }],
    };
    const options = { toolCallId: randomUUID(), messages: [], context: undefined };
    await assert.rejects(
      async () => publish(input, options),
      /bound to the checked address/,
    );
    const lookup = await resolveVotingIntersection(
      "Fixture & Example",
      locationService().fetcher,
    );
    session.browser.observations.set(observed.id, {
      ...observed,
      voting: {
        lookup,
        venue: { name: "Fixture Voting Hall", address: "200 Venue St" },
      },
    });
    const result = cityResultSchema.parse(await publish(input, options));
    assert.equal(result.title, "Voting information near your intersection");
    assert.deepEqual(result.voting?.lookup, lookup);
    assert.equal(result.voting?.venue?.address, "200 Venue St");
    session.browser.observations.set(observed.id, {
      ...observed,
      voting: { lookup: { type: "address", address: "100 Example Ave W" } },
    });
    assert.equal(
      cityResultSchema.parse(await publish(input, options)).title,
      "Your voting information",
    );
    assert.equal(
      result.voting?.lookup.type,
      "intersection",
      "A later lookup must not relabel an earlier card",
    );
  } finally {
    await removeSession(session);
  }
});

test("retained replies with missing or duplicate message IDs restore with distinct stable keys", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    session.messages = [
      { id: "", role: "assistant", parts: [{ type: "text", text: "Fixture reply" }] },
      {
        id: "",
        role: "assistant",
        parts: [{ type: "text", text: "Another fixture reply" }],
      },
    ];
    const restored = getSession(`${SESSION_COOKIE}=${session.id}`);
    assert.ok(restored);
    const ids = restored.messages.map((message) => message.id);
    assert.ok(ids.every(Boolean));
    assert.equal(new Set(ids).size, 2);
    assert.deepEqual(
      getSession(`${SESSION_COOKIE}=${session.id}`)?.messages.map(
        (message) => message.id,
      ),
      ids,
    );
  } finally {
    await removeSession(session);
  }
});
