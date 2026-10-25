import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import { ExecutionTimings } from "./timing.ts";
import type { VotingLookup } from "./contracts.ts";
import { normalizeStreet, votingVenue } from "./voting.ts";
import { tennisBookingUrl } from "./tennis-contracts.ts";
import {
  allowedActions,
  addressSuggestionAllowed,
  approvedPageUrl,
  normalizeCityLink,
  type BrowserAction,
  type BrowserControl,
} from "./policy.ts";

export type Observation = {
  id: string;
  url: string;
  title: string;
  checkedAt: string;
  text: string;
  controls: (BrowserControl & { actions: BrowserAction[] })[];
  voting?: { lookup: VotingLookup; venue?: { name: string; address: string } };
  tennisCourts?: string[];
};
const resourceHosts = new Set([
  "myvote.toronto.ca",
  "www.toronto.ca",
  "map.toronto.ca",
  "anc.ca.apm.activecommunities.com",
  "akamai-anc.ca.apm.activecommunities.com",
  "static-cdn.active.com",
  "akamai-anprodca.active.com",
]);
let browser: Promise<Browser> | undefined;
async function getBrowser() {
  // The ACTIVE portal intermittently stalls after HTTP/2 responses in Chromium.
  // HTTPS over HTTP/1.1 loaded in the paired check; all origin/action policy stays on.
  browser ??= chromium
    .launch({ headless: true, args: ["--disable-http2"] })
    .catch(() => {
      browser = undefined;
      throw new Error("Browser unavailable. Run pnpm browser:install, then retry.");
    });
  const current = await browser;
  if (!current.isConnected()) {
    browser = undefined;
    return getBrowser();
  }
  return current;
}
export class CityBrowser {
  timing = new ExecutionTimings();
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private current: Observation | undefined;
  private requestedAddress: string | undefined;
  private votingLookup: VotingLookup | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  readonly observations = new Map<string, Observation>();
  async run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private async getPage() {
    if (this.page && !this.page.isClosed()) return this.page;
    this.context = await this.timing.measure("browser_startup", async () =>
      (await getBrowser()).newContext({
        serviceWorkers: "block",
        acceptDownloads: false,
      }),
    );
    await this.context.route("**/*", async (route) => {
      const request = route.request();
      const u = new URL(request.url());
      if (request.isNavigationRequest() && request.frame() === this.page?.mainFrame()) {
        try {
          approvedPageUrl(u.href);
        } catch {
          await route.abort();
          return;
        }
      }
      if (!resourceHosts.has(u.hostname) || u.protocol !== "https:") {
        await route.abort();
        return;
      }
      // No cart, enrollment, account or payment endpoints, even if a page changes.
      if (
        /\/(?:cart|newcart|checkout|enroll|payment|login|signin|account)(?:\/|\?|$)/i.test(
          u.pathname,
        )
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(12_000);
    this.page.setDefaultNavigationTimeout(25_000);
    return this.page;
  }
  async open(url: string): Promise<Observation> {
    this.votingLookup = undefined;
    const page = await this.getPage();
    await this.navigate(page, url);
    await this.settle(page);
    return this.observe();
  }
  async searchTennisCourts(): Promise<Observation> {
    await this.open(tennisBookingUrl);
    const page = await this.getPage();
    await page
      .getByRole("heading", { name: "Quick reservation", exact: true })
      .waitFor();
    await page
      .getByRole("link", { name: /^Court - / })
      .first()
      .waitFor();
    return this.observe();
  }
  async lookupVotingPlace(lookup: VotingLookup): Promise<Observation> {
    let observed = await this.open("https://myvote.toronto.ca/home");
    const one = (matches: (control: BrowserControl) => boolean) => {
      const controls = observed.controls.filter(matches);
      const control = controls[0];
      if (controls.length !== 1 || !control)
        throw new Error("The MyVote lookup form changed. Please try again shortly.");
      return control;
    };
    const act = async (
      control: BrowserControl,
      action: BrowserAction,
      value?: string,
    ) => {
      observed = await this.act(observed.id, control.ref, action, value);
    };
    const until = async (ready: (current: Observation) => boolean) => {
      for (let attempt = 0; attempt < 10 && !ready(observed); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        observed = await this.observe();
      }
      if (!ready(observed))
        throw new Error(
          "MyVote did not return the requested address or voting place. Try again shortly or check directly in MyVote.",
        );
    };
    await act(
      one((control) => control.field === "Address"),
      "fill",
      lookup.address,
    );
    await until((current) =>
      current.controls.some((control) => control.role === "option"),
    );
    const selected = one(
      (control) =>
        control.role === "option" &&
        normalizeStreet(control.name) === normalizeStreet(lookup.address),
    );
    await act(selected, "click");
    await act(
      one((control) => control.name === "Go"),
      "click",
    );
    await until((current) =>
      current.controls.some(
        (control) => control.href === "https://myvote.toronto.ca/votingplace",
      ),
    );
    await act(
      one((control) => control.href === "https://myvote.toronto.ca/votingplace"),
      "click",
    );
    await until((current) => Boolean(votingVenue(current.text)));
    if (
      !observed.text
        .split(/\r?\n/)
        .some((line) => normalizeStreet(line) === normalizeStreet(lookup.address))
    )
      throw new Error(
        "MyVote returned a different lookup address. No voting result was published.",
      );
    this.votingLookup = structuredClone(lookup);
    return this.observe();
  }
  private async settle(page: Page) {
    await this.timing.measure("page_loading", () =>
      page.waitForLoadState("domcontentloaded"),
    );
    if (new URL(page.url()).pathname === "/toronto/reservation/landing/quick") {
      await this.timing.measure("external_wait", () =>
        page
          .getByRole("heading", { name: "Quick reservation", exact: true })
          .waitFor({ timeout: 12_000 }),
      );
    } else if (page.url().includes("activecommunities")) {
      await this.timing.measure("external_wait", () =>
        page
          .getByText(/matching result\(s\)|Activity meeting dates|No activities found/i)
          .first()
          .waitFor({ timeout: 12_000 }),
      );
    } else await this.timing.measure("external_wait", () => page.waitForTimeout(500));
  }
  private async navigate(page: Page, url: string) {
    await this.timing.measure("navigation", () =>
      page.goto(approvedPageUrl(url), { waitUntil: "commit" }),
    );
  }
  async searchRecreation(keyword: string, canoeLanding: boolean) {
    const page = await this.getPage();
    const url = `https://anc.ca.apm.activecommunities.com/toronto/activity/search?${canoeLanding ? "center_ids=1330&" : ""}viewMode=list`;
    // Known public steps run together; the model still selects the search and result.
    await this.navigate(page, url);
    await this.settle(page);
    await this.timing.measure("form_entry", () =>
      page.locator("#activity-cascaded-search-input").fill(keyword),
    );
    await this.timing.measure("form_entry", () =>
      page.getByRole("button", { name: "Search", exact: true }).click(),
    );
    await this.timing.measure("external_wait", async () => {
      await page.waitForURL(
        (current) => current.searchParams.get("activity_keyword") === keyword,
      );
      await page
        .getByText(/matching result\(s\)|No activities found/i)
        .first()
        .waitFor();
    });
    return this.observe();
  }
  async observe(): Promise<Observation> {
    return this.timing.measure("service_discovery", () => this.readObservation());
  }
  private async readObservation(): Promise<Observation> {
    const page = await this.getPage();
    const url = approvedPageUrl(page.url());
    const data = await page.evaluate(() => {
      // Dynamic lists can reuse DOM nodes. Remove refs from the previous snapshot,
      // including controls that are now hidden or no longer match the selector.
      for (const element of document.querySelectorAll("[data-toronto-one-ref]"))
        element.removeAttribute("data-toronto-one-ref");
      const root =
        document.querySelector("main, #page-body, #main-content-body") ?? document.body;
      const text = (
        root instanceof HTMLElement ? root.innerText : (root.textContent ?? "")
      ).slice(0, 24_000);
      const controls = [
        ...document.querySelectorAll(
          "a[href],button,input:not([type=hidden]),select,[role=option]",
        ),
      ]
        .filter(
          (e) =>
            e instanceof HTMLElement &&
            e.getBoundingClientRect().width > 0 &&
            e.getAttribute("aria-hidden") !== "true" &&
            e.getAttribute("aria-disabled") !== "true" &&
            !("disabled" in e && e.disabled === true),
        )
        .map((e, i) => {
          const ref = `c${i}`;
          e.setAttribute("data-toronto-one-ref", ref);
          const id = e.id;
          const label = id
            ? [...document.querySelectorAll("label")].find((l) => l.htmlFor === id)
                ?.textContent
            : null;
          let context = "";
          // Keep an individual linked record together without merging adjacent
          // activities. This is generic DOM evidence, not a service task script.
          if (e.tagName === "A") {
            let ancestor = e.parentElement;
            for (
              let depth = 0;
              ancestor && depth < 6;
              depth++, ancestor = ancestor.parentElement
            ) {
              const candidate = ancestor.innerText.trim();
              if (
                ancestor.querySelectorAll("a[href]").length !== 1 ||
                candidate.length > 1200
              )
                break;
              context = candidate;
            }
          }
          return {
            ref,
            tag: e.tagName.toLowerCase(),
            role: e.getAttribute("role") ?? "",
            name: (
              e.getAttribute("aria-label") ||
              label ||
              e.textContent ||
              e.getAttribute("placeholder") ||
              id
            )
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 180),
            field: id,
            href: e.getAttribute("href"),
            type: e.getAttribute("type") ?? "",
            context,
          };
        });
      return { text, controls, title: document.title };
    });
    const tennisCourts =
      new URL(url).pathname === "/toronto/reservation/landing/quick"
        ? await page.getByRole("link", { name: /^Court - / }).evaluateAll((elements) =>
            elements
              .filter((element) => element.getBoundingClientRect().width > 0)
              .map(
                (element) =>
                  element.getAttribute("aria-label") ?? element.textContent ?? "",
              )
              .filter((name) => /^Court - \d+ - .+/.test(name))
              .slice(0, 100),
          )
        : [];
    if (tennisCourts.length)
      data.text += "\nCourts listed:\n" + tennisCourts.join("\n");
    if (
      /verify you are human|access denied|unusual traffic|complete the captcha/i.test(
        data.text,
      )
    )
      throw new Error(
        "The official service requires human verification. Continue directly on the official site; no challenge was bypassed.",
      );
    const observation: Observation = {
      id: randomUUID(),
      url,
      title: data.title,
      checkedAt: new Date().toISOString(),
      text: data.text,
      ...(tennisCourts.length ? { tennisCourts } : {}),
      controls: data.controls
        .map((c) => {
          const control = {
            ...c,
            href: c.href ? normalizeCityLink(c.href, url) : null,
          };
          return { ...control, actions: allowedActions(url, control) };
        })
        .filter((c) => c.actions.length > 0),
    };
    this.current = observation;
    if (
      new URL(observation.url).hostname === "myvote.toronto.ca" &&
      new URL(observation.url).pathname === "/votingplace" &&
      this.votingLookup &&
      observation.text
        .split(/\r?\n/)
        .some(
          (line) =>
            normalizeStreet(line) === normalizeStreet(this.votingLookup?.address ?? ""),
        )
    ) {
      observation.voting = { lookup: structuredClone(this.votingLookup) };
      const venue = votingVenue(observation.text);
      if (venue) observation.voting.venue = venue;
    }
    this.observations.set(observation.id, observation);
    if (this.observations.size > 40) {
      const first = this.observations.keys().next().value;
      if (first) this.observations.delete(first);
    }
    return observation;
  }
  async act(
    observationId: string,
    ref: string,
    action: BrowserAction,
    value?: string,
  ): Promise<Observation> {
    if (!this.current || this.current.id !== observationId)
      throw new Error(
        "That page observation is stale. Observe the current page first.",
      );
    const control = this.current.controls.find((c) => c.ref === ref);
    if (!control || !control.actions.includes(action))
      throw new Error(
        "That action is not enabled in public browser tools. Use the private recreation booking panel for sign-in, participant selection and approved checkout.",
      );
    if (
      control.role === "option" &&
      !addressSuggestionAllowed(
        this.requestedAddress,
        control.name,
        this.current.controls.filter((c) => c.role === "option").map((c) => c.name),
      )
    )
      throw new Error(
        "Several addresses match. Ask the resident for a more precise address; do not choose for them.",
      );
    const page = await this.getPage();
    if (page.url() !== this.current.url)
      throw new Error("Page changed. Observe again.");
    const element = page.locator(`[data-toronto-one-ref="${ref}"]`);
    if (action === "fill") {
      if (!value || value.length > 180)
        throw new Error(
          "Enter a short address or search phrase, never a password or identity document.",
        );
      if (control.field === "Address") {
        this.requestedAddress = value;
        this.votingLookup = undefined;
      }
      await this.timing.measure("form_entry", () => element.fill(value));
    } else if (action === "select") {
      if (!value) throw new Error("Select a value.");
      await this.timing.measure("form_entry", () =>
        element.selectOption({ label: value }),
      );
    } else if (control.href) {
      await this.navigate(page, control.href);
    } else {
      await this.timing.measure("form_entry", () => element.click());
    }
    await this.settle(page);
    return this.observe();
  }
  async close() {
    await this.context?.close().catch(() => undefined);
    this.context = undefined;
    this.page = undefined;
    this.current = undefined;
    this.requestedAddress = undefined;
    this.votingLookup = undefined;
    this.observations.clear();
  }
}

export async function closeBrowserRuntime() {
  const current = browser;
  browser = undefined;
  if (current) await (await current).close();
}
