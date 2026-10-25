import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { TennisBooking } from "../src/lib/ai/tennis-booking.ts";
import {
  tennisBookingUrl,
  validateTennisRequest,
  readTennisCheckout,
  verifyTennisPermit,
  type TennisResource,
  type TennisCheckout,
} from "../src/lib/ai/tennis-contracts.ts";
import {
  journalTennisAttempt,
  makeTennisApproval,
  priorTennisAttempt,
  verifyTennisApproval,
} from "../src/lib/ai/tennis-approval.ts";
import { approvedPageUrl } from "../src/lib/ai/policy.ts";
import { createCityAgent } from "../src/lib/ai/agent.ts";
import { getSession, removeSession } from "../src/lib/ai/session.ts";
import {
  readBookingCheckpoint,
  writeBookingCheckpoint,
} from "../src/lib/ai/booking-checkpoint.ts";

// Owned fixtures only. No City authentication, cart, payment or reservation request.
const resource: TennisResource = {
  kind: "tennis",
  name: "Court - 1 - Fixture Park",
  sourceUrl: tennisBookingUrl,
};
const request = {
  date: "2026-10-26",
  startTime: "18:00",
  durationMinutes: 60 as const,
  attendees: 2,
  maxTotalCents: 0,
};
const now = new Date("2026-10-25T16:00:00Z");
const identity = `${resource.name}\nOctober 26, 2026\n6:00 PM – 7:00 PM\nReserved for\nFixture Resident\nAttendees: 2`;
const cart = `1 item\n${identity}\nDue Now\n$0.00`;
const payload: TennisCheckout = {
  ...resource,
  request,
  participant: "Fixture Resident",
  totalCents: 0,
  currency: "CAD",
};
const permit = `Permit Number: P1000\n${identity}\nTotal Paid $0.00\nStatus: Confirmed`;
const record = `Reservations\nReceipt # R1000\nPermit Number: P1000\n${identity}\nTotal Paid $0.00`;

test("tennis uses the exact City schedule and keeps transaction/account pages out of public tools", () => {
  assert.equal(approvedPageUrl(tennisBookingUrl), tennisBookingUrl);
  for (const url of [
    tennisBookingUrl.replace("groupId=2", "groupId=3"),
    tennisBookingUrl + "&redirect=https://example.com",
    tennisBookingUrl + "&groupId=3",
    tennisBookingUrl.replace("/landing/quick", "/checkout"),
    "https://anc.ca.apm.activecommunities.com/toronto/myaccount",
    "https://anc.ca.apm.activecommunities.com/toronto/receipt?receiptId=1",
  ])
    assert.throws(() => approvedPageUrl(url));
});
test("court requests default to zero and validate actual Toronto dates and match-play bounds", () => {
  const { maxTotalCents: omitted, ...withoutBudget } = request;
  assert.equal(omitted, 0);
  assert.equal(validateTennisRequest(withoutBudget, now).maxTotalCents, 0);
  for (const patch of [
    { date: "2026-02-30" },
    { date: "2026-10-24" },
    { date: "2026-11-10" },
    { attendees: 10 },
    { startTime: "23:00" },
    { startTime: "18:30" },
    { durationMinutes: 120 },
    { maxTotalCents: -1 },
  ])
    assert.throws(() => validateTennisRequest({ ...request, ...patch }, now));
});
test("cart verification rejects charges above zero, extra items and changed court/slot/party", () => {
  assert.deepEqual(readTennisCheckout(cart, resource, request), payload);
  assert.throws(
    () =>
      readTennisCheckout(
        cart + "\nTotal $5.00\nCredit applied $5.00",
        resource,
        request,
      ),
    /maximum charge/,
  );
  for (const text of [
    cart.replace("$0.00", "$5.00"),
    cart.replace("1 item", "2 items"),
    cart.replace("Fixture Park", "Different Park"),
    cart.replace("October 26", "October 27"),
    cart.replace("7:00 PM", "8:00 PM"),
    cart.replace("Attendees: 2", "Attendees: 3"),
    cart.replace("Reserved for\nFixture Resident", "Unknown account"),
  ])
    assert.throws(() => readTennisCheckout(text, resource, request));
  assert.equal(
    readTennisCheckout(cart.replace("$0.00", "$5.00"), resource, {
      ...request,
      maxTotalCents: 500,
    }).totalCents,
    500,
  );
});
test("approval binds complete court request, booking name and amount and expires", () => {
  const plan = makeTennisApproval(payload, 1000);
  for (const changed of [
    { ...payload, totalCents: 1 },
    { ...payload, participant: "Other Resident" },
    { ...payload, request: { ...request, startTime: "19:00" } },
  ])
    assert.throws(() =>
      verifyTennisApproval(plan, plan.id, plan.digest, changed, 1001),
    );
  assert.equal(verifyTennisApproval(plan, plan.id, plan.digest, payload, 1001), plan);
  assert.throws(() =>
    verifyTennisApproval(plan, plan.id, plan.digest, payload, plan.expiresAt),
  );
  plan.consumed = true;
  assert.throws(() => verifyTennisApproval(plan, plan.id, plan.digest, payload, 1001));
});
test("quick-reservation checkout reviews the expanded cart and full cost even with account credit", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tennis-cart-layout-"));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  let due = "18.40";
  let attendees = 2;
  let bookingCount = 1;
  let day = 26;
  await context.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/toronto/quickreservation/checkout") {
      await route.fulfill({
        contentType: "text/html",
        body: "<h1>Check Out</h1><button>Pay</button>",
      });
    } else if (pathname === "/toronto/newcart") {
      await route.fulfill({
        contentType: "text/html",
        body: `<main id="main-content-body"><h1>Shopping Cart</h1><h2>Fixture<br>Resident</h2><p>1 item, $${due} in total.</p><a href="#" onclick="document.querySelector('#details').hidden=false;return false">Tennis $${due}</a><p>QUICK RESERVATION</p><p>Unrelated event text: October 26, 2026 6:00 PM - 7:00 PM</p><p>1 Resource(s): ${resource.name}</p><p>Number of booking(s): ${bookingCount}</p><div id="details" hidden><p>${resource.name}</p><p><span>Oct ${day}, 2026</span><span>6:00PM -7:00PM</span></p><p>Attendee(s): ${attendees}</p></div><p>Subtotal $16.50</p><p>Taxes $1.90</p><p>Due Now $${due}</p><a href="#" aria-label="delete transaction Tennis $${due}">Delete</a><button>Check out</button></main>`,
      });
    } else await route.abort();
  });
  const page = await context.newPage();
  const base = new URL(tennisBookingUrl).origin;
  try {
    const flow = new TennisBooking(resource, { directory, now: () => now });
    flow.setRequest(request);
    await page.goto(base + "/toronto/quickreservation/checkout");
    await assert.rejects(flow.review(page), /maximum charge/);
    assert.equal(new URL(page.url()).pathname, "/toronto/newcart");
    due = "0.00";
    await page.reload();
    await assert.rejects(flow.review(page), /maximum charge/);
    flow.setRequest({ ...request, maxTotalCents: 2000 });
    const review = await flow.review(page);
    assert.equal(review.status, "review_required");
    assert.equal(review.facilityReview?.totalCents, 1840);
    assert.equal(review.facilityReview?.participant, "Fixture Resident");
    day = 27;
    await page.reload();
    await assert.rejects(flow.review(page), /exactly the selected court, date/);
    day = 26;
    bookingCount = 2;
    await page.reload();
    await assert.rejects(flow.review(page), /exactly one court and one booking/);
    bookingCount = 1;
    attendees = 3;
    await page.reload();
    await assert.rejects(flow.review(page), /attendee count/);
    assert.equal(
      await priorTennisAttempt({ ...payload, totalCents: 1840 }, directory),
      false,
    );
  } finally {
    await context.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test("permit confirmation needs official document plus matching account, identity, total and active status", () => {
  assert.equal(verifyTennisPermit(permit, record, payload, "R1000"), "P1000");
  for (const text of [
    permit.replace("P1000", "P2000"),
    permit.replace("Fixture Resident", "Different Resident"),
    permit.replace("Fixture Resident", "Fixture Resident Junior"),
    permit.replace("Fixture Park", "Fixture Park East"),
    permit.replace("6:00 PM", "5:00 PM"),
    permit.replace("$0.00", "$5.00"),
    permit.replace("Status: Confirmed", "Status: Cancelled"),
    permit.replace("Status: Confirmed", "Status: Pending approval"),
    permit.replace("Status: Confirmed", ""),
    permit.replace("Permit Number: P1000", "Thank you for booking"),
  ])
    assert.throws(() => verifyTennisPermit(text, record, payload, "R1000"));
  assert.throws(() =>
    verifyTennisPermit(permit, record.replace("R1000", "R2000"), payload, "R1000"),
  );
  assert.throws(() =>
    verifyTennisPermit(permit, record.replace("R1000", "R10000"), payload, "R1000"),
  );
  assert.throws(() =>
    verifyTennisPermit(permit, record.replace("P1000", "P10000"), payload, "R1000"),
  );
  assert.throws(() =>
    verifyTennisPermit(permit, record.replace("$0.00", "$5.00"), payload, "R1000"),
  );
});
test("outbound handoff survives new adapters and refuses duplicate journal claims", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tennis-journal-fixture-"));
  try {
    const plan = makeTennisApproval(payload);
    assert.equal(await priorTennisAttempt(payload, directory), false);
    await journalTennisAttempt(plan, undefined, directory);
    assert.equal(await priorTennisAttempt(payload, directory), true);
    await assert.rejects(
      journalTennisAttempt(makeTennisApproval(payload), undefined, directory),
    );
    await assert.rejects(
      journalTennisAttempt(makeTennisApproval(payload), "P2000", directory),
    );
    await journalTennisAttempt(plan, "P1000", directory);
    assert.equal(await priorTennisAttempt(payload, directory), true);
    const files = await readdir(directory);
    assert.equal(files.length, 1);
    const filename = path.join(directory, files[0] ?? "");
    assert.equal((await stat(filename)).mode & 0o777, 0o600);
    assert.ok(!(await readFile(filename, "utf8")).includes("Fixture Resident"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("court publication requires an exact fresh observed resource and exposes no private checkout tool", async () => {
  const session = getSession(null);
  assert.ok(session);
  try {
    const observed = {
      id: randomUUID(),
      url: tennisBookingUrl,
      title: "Owned fixture",
      checkedAt: new Date().toISOString(),
      text: resource.name + "\nSign in to view availability.",
      controls: [],
      tennisCourts: [resource.name],
    };
    session.browser.observations.set(observed.id, observed);
    const tools = createCityAgent(session).tools;
    assert.ok(tools.publishResult.execute);
    assert.ok(tools.prepareTennisReservation.execute);
    const options = { toolCallId: randomUUID(), messages: [], context: undefined };
    assert.throws(() =>
      tools.publishResult.execute?.(
        {
          kind: "facility",
          observationId: observed.id,
          facilityName: "Imaginary Court",
          facts: [{ label: "Court", quote: resource.name }],
        },
        options,
      ),
    );
    const result = await tools.publishResult.execute(
      {
        kind: "facility",
        observationId: observed.id,
        facilityName: resource.name,
        facts: [{ label: "Court", quote: resource.name }],
      },
      options,
    );
    assert.ok(
      typeof result === "object" &&
        result !== null &&
        "id" in result &&
        typeof result.id === "string",
    );
    const prepared = await tools.prepareTennisReservation.execute(
      { resultId: result.id },
      options,
    );
    assert.ok("status" in prepared);
    assert.equal(prepared.status, "facility_details_required");
    assert.ok(
      !Object.keys(tools).some((name) =>
        /pay|authorizeTennis|verifyTennisPermit|signature/i.test(name),
      ),
    );
  } finally {
    await removeSession(session);
  }
});

test("owned browser fixture covers cart review, resident handoff and verified permit without any City traffic", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "tennis-flow-fixture-"));
  let failExport = true;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const base = "https://anc.ca.apm.activecommunities.com";
  let requests = 0;
  let signedIn = false;
  await context.route("**/*", async (route) => {
    requests++;
    const pathname = new URL(route.request().url()).pathname;
    const bodies: Record<string, string> = {
      "/toronto/reservation/landing/quick": `<h1>Quick reservation</h1><a href="#">${signedIn ? "Sign Out" : "Sign In"}</a><button role="combobox" aria-label="Date picker">Date</button><button aria-label="Oct 26, 2026">26</button><a href="#">${resource.name}</a>`,
      "/toronto/newcart": `<main id="main-content-body"><pre>${cart}</pre><button onclick="this.dataset.clicked='yes'">Pay</button><label><input type="checkbox">Accept terms</label><input aria-label="Signature"></main>`,
      "/toronto/myaccount":
        '<a href="/toronto/myaccount/history">Transaction and Payment History</a>',
      "/toronto/myaccount/history": `<section><pre>${record}</pre><a href="/toronto/receipt?receiptId=1">receipt R1000</a><a href="/toronto/reservation/permit?permitId=1">View Permit</a></section>`,
      "/toronto/reservation/permit": `<h1>Permit Number: P1000</h1><pre>${permit}</pre>`,
    };
    const body = bodies[pathname];
    if (!body) {
      await route.abort();
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/html", body });
  });
  const page = await context.newPage();
  try {
    const flow = new TennisBooking(resource, {
      directory,
      now: () => now,
      renderPdf: async (page) => {
        if (failExport) throw new Error("Owned fixture export failure");
        return page.pdf({ format: "Letter" });
      },
    });
    flow.setRequest(request);
    assert.equal((await flow.prepare(page)).status, "sign_in_required");
    signedIn = true;
    assert.equal((await flow.resume(page)).status, "resident_action_required");
    await page.goto(base + "/toronto/newcart");
    const review = await flow.review(page);
    assert.equal(review.status, "review_required");
    assert.ok(review.facilityReview);
    await page.goto("https://example.com/toronto/newcart");
    await assert.rejects(
      flow.authorizeCheckout(
        page,
        review.facilityReview.id,
        review.facilityReview.digest,
      ),
      /Review the current City cart/,
    );
    await page.goto(base + "/toronto/newcart");
    const handoff = await flow.authorizeCheckout(
      page,
      review.facilityReview.id,
      review.facilityReview.digest,
    );
    assert.equal(handoff.status, "resident_checkout_required");
    assert.equal(
      await page
        .getByRole("button", { name: "Pay", exact: true })
        .getAttribute("data-clicked"),
      null,
    );
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.equal(await page.getByLabel("Signature").inputValue(), "");
    // A resident-completed outcome is supplied solely inside the owned fixture.
    await page.setContent(
      `<main>Owned fixture: payment response was unavailable.</main>`,
    );
    const complete = await flow.verifyPermit(page);
    assert.equal(complete.status, "confirmed");
    assert.equal(complete.receipt?.permitNumber, "P1000");
    assert.ok(flow.receiptPath());
    assert.equal(
      flow.receiptPdfPath(),
      undefined,
      "Export failure cannot erase verified permit status.",
    );
    failExport = false;
    await flow.capturePrintablePermit(page);
    assert.ok(flow.receiptPdfPath());
    const owner = randomUUID();
    await writeBookingCheckpoint(
      owner,
      complete,
      flow.receiptPath(),
      flow.receiptPdfPath(),
      directory,
    );
    assert.equal(
      readBookingCheckpoint(owner, Date.now(), directory)?.state.receipt?.documentKind,
      "permit",
    );
    assert.ok(requests >= 4);
  } finally {
    await context.close();
    await browser.close();
    await rm(directory, { recursive: true, force: true });
  }
});
