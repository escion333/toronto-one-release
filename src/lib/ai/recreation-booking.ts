import { appPath } from "../app-path.ts";
import {
  createResidentDesktop,
  closeResidentDesktop,
  remoteCityEnabled,
  residentDesktops,
  residentBrowserEnvironment,
} from "./remote-desktop.ts";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ExecutionTimings } from "./timing.ts";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { approvedPageUrl, normalizeCityLink, normalizeEvidence } from "./policy.ts";
import type { BookingState } from "./booking-contracts.ts";
import type { BookingCheckpoint } from "./booking-checkpoint.ts";
import {
  extractReceiptNumber,
  makeCheckoutApproval,
  verifyCheckoutApproval,
  recordOutboundAttempt,
  recordConfirmedAttempt,
  priorAttempt,
  privateBookingDirectory,
  type CheckoutApproval,
  type CheckoutPayload,
} from "./booking-approval.ts";

export class BookingStepError extends Error {}

const origin = "https://anc.ca.apm.activecommunities.com";

/** Private deterministic adapter. Never expose this page or its contents to the LLM. */
export class RecreationBooking {
  private owner: string;
  private residentPaused = false;
  private pendingActivityUrl: string | undefined;
  constructor(owner: string = randomUUID()) {
    this.owner = owner;
  }
  residentView() {
    const desktop = residentDesktops.get(this.owner);
    const allowed =
      !this.residentPaused &&
      ["sign_in_required", "resident_action_required", "needs_attention"].includes(
        this.state.status,
      );
    if (desktop) desktop.interactive = allowed;
    return desktop && allowed
      ? {
          available: true,
          origin: "https://anc.ca.apm.activecommunities.com",
          expiresAt: desktop.expiresAt,
        }
      : { available: false };
  }
  releaseResidentControl() {
    this.residentPaused = false;
    this.residentView();
  }
  async requestPreparation(url: string) {
    const approved = new URL(approvedPageUrl(url));
    if (!/^\/toronto\/activity\/search\/detail\/\d+$/.test(approved.pathname))
      throw new BookingStepError("Choose a City activity detail page.");
    this.pendingActivityUrl = approved.href;
    if (!this.page || this.page.isClosed()) return this.connect();
    if (this.state.status === "sign_in_required") return this.snapshot();
    return this.prepare(url);
  }
  pauseResidentControl() {
    this.residentPaused = true;
    const desktop = residentDesktops.get(this.owner);
    if (desktop) desktop.interactive = false;
  }
  private browser: Browser | undefined;
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private participantChoices?: Map<string, string>;
  private approval?: CheckoutApproval;
  private receiptFile: string | undefined;
  private receiptPdfFile: string | undefined;
  private receiptSourceUrl?: string;
  private policyRevision?: number;
  private operations?: NonNullable<BookingState["operations"]>;
  readonly timing = new ExecutionTimings();
  private state: BookingState = {
    status: "disconnected",
    message: "Connect your City account when you’re ready to reserve.",
    timings: [],
  };
  snapshot(): BookingState {
    this.residentView();
    return {
      ...this.state,
      ...(this.state.review
        ? {
            review: {
              ...this.state.review,
              expired: Date.now() >= this.state.review.expiresAt,
            },
          }
        : {}),
      timings: [...this.timing.spans],
      operations: this.operations ?? [],
      canReconcile: Boolean(
        this.approval?.consumed && this.page && !this.page.isClosed(),
      ),
    };
  }
  restoreConfirmed(checkpoint: BookingCheckpoint) {
    this.state = checkpoint.state;
    this.state.message =
      "Verified reservation restored from its private local checkpoint. Reconnect City sign-in for further account access.";
    this.receiptFile = checkpoint.receiptFile
      ? path.join(privateBookingDirectory, checkpoint.receiptFile)
      : undefined;
    this.receiptPdfFile = checkpoint.pdfFile
      ? path.join(privateBookingDirectory, checkpoint.pdfFile)
      : undefined;
  }
  recordOperation(action: string, start: number, spanIndex: number, ok: boolean) {
    this.operations = [
      ...(this.operations ?? []),
      {
        action,
        elapsedMs: Math.round(performance.now() - start),
        ok,
        phases: this.timing.spans.slice(spanIndex),
      },
    ].slice(-12);
  }
  preparationFailed(message: string) {
    if (this.state.status === "preparing") {
      this.state.status = "needs_attention";
      this.state.message = message;
    }
  }
  async connect() {
    if (this.page && !this.page.isClosed()) {
      await this.page.bringToFront();
      return this.snapshot();
    }
    const confirmed = this.state.status === "confirmed" ? this.state : undefined;
    const desktop = remoteCityEnabled()
      ? await createResidentDesktop(this.owner)
      : undefined;
    try {
      await this.timing.measure("browser_startup", async () => {
        this.browser = await chromium.launch({
          headless: false,
          args: [
            "--disable-http2",
            "--window-size=430,900",
            "--window-position=0,0",
            "--force-device-scale-factor=1",
          ],
          ...(desktop
            ? {
                executablePath: path.join(
                  process.cwd(),
                  "scripts",
                  "private-chromium.sh",
                ),
                env: residentBrowserEnvironment(desktop, chromium.executablePath()),
              }
            : {}),
        });
        this.context = await this.browser.newContext({
          acceptDownloads: true,
          viewport: { width: 430, height: 790 },
        });
        // An in-memory incognito context. No persistent profile, password capture,
        // storageState, tracing, console forwarding or model browser tools.
        await this.installNavigationPolicy(this.context);
        this.page = await this.context.newPage();
        this.page.setDefaultTimeout(12_000);
        this.page.setDefaultNavigationTimeout(25_000);
      });
      const page = this.requirePage();
      await this.timing.measure("navigation", () =>
        page.goto(`${origin}/toronto/signin?onlineSiteId=0`, {
          waitUntil: "domcontentloaded",
        }),
      );
      await this.timing.measure("page_loading", () =>
        page.getByRole("textbox", { name: /Email address/ }).waitFor(),
      );
      await page
        .getByRole("textbox", { name: /Email address/ })
        .scrollIntoViewIfNeeded();
      this.state = confirmed ?? {
        status: "sign_in_required",
        message:
          "Sign in in the secure City browser below, then choose I’m signed in. Toronto One does not read your password or MFA codes.",
        timings: [],
      };
      if (confirmed)
        this.state.message =
          "City sign-in window opened. Your previously verified reservation and receipt remain available here.";
      return this.snapshot();
    } catch (error) {
      await this.browser?.close().catch(() => undefined);
      await closeResidentDesktop(this.owner);
      this.browser = undefined;
      this.context = undefined;
      this.page = undefined;
      throw error;
    }
  }
  private async installNavigationPolicy(context: BrowserContext) {
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      let mainNavigation = false;
      if (request.isNavigationRequest()) {
        try {
          mainNavigation = request.frame().parentFrame() === null;
        } catch {
          mainNavigation = true;
        } // New popup frames may not exist yet.
      }
      if (mainNavigation) {
        if (
          url.protocol !== "https:" ||
          ![
            "anc.ca.apm.activecommunities.com",
            "ca.apm.activecommunities.com",
          ].includes(url.hostname) ||
          !url.pathname.startsWith("/toronto/")
        ) {
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    this.policyRevision = 1;
  }
  private async refreshNavigationPolicy() {
    if (this.context && this.policyRevision !== 1) {
      await this.context.unrouteAll({ behavior: "ignoreErrors" });
      await this.installNavigationPolicy(this.context);
    }
  }
  private requirePage() {
    if (!this.page || this.page.isClosed())
      throw new BookingStepError("Connect the City browser first.");
    return this.page;
  }
  async resume() {
    this.pauseResidentControl();
    if (["executing", "outcome_unknown", "confirmed"].includes(this.state.status))
      return this.snapshot();
    const page = this.requirePage();
    if (/\/toronto\/newcart(?:\?|$)/.test(page.url())) return this.reviewCart();
    // Inspect only the presence of navigation controls, never login field values.
    const signedOut = await page
      .getByRole("link", { name: "Sign In", exact: true })
      .isVisible();
    if (signedOut || /\/signin(?:\?|$)/i.test(page.url())) {
      this.state = {
        status: "sign_in_required",
        message: "Complete City sign-in in the browser window, then resume.",
        timings: [],
      };
    } else if (
      await page.getByRole("link", { name: "Sign Out", exact: true }).isVisible()
    ) {
      this.state = {
        status: "ready",
        message:
          "City browser connected. Choose an activity to prepare; no reservation has been submitted.",
        timings: [],
      };
    } else {
      this.state.status = "needs_attention";
      this.state.message =
        "The City sign-in state could not be verified. Inspect the official browser and resume.";
    }
    if (this.state.status === "ready" && this.pendingActivityUrl)
      return this.prepare(this.pendingActivityUrl);
    return this.snapshot();
  }
  private async navigate(url: string) {
    const page = this.requirePage();
    await this.timing.measure("navigation", () =>
      page.goto(url, { waitUntil: "commit" }),
    );
    await this.timing.measure("page_loading", () =>
      page.waitForLoadState("domcontentloaded"),
    );
  }
  async prepare(url: string) {
    if (["executing", "outcome_unknown", "confirmed"].includes(this.state.status))
      throw new BookingStepError(
        "Reconcile the current booking before starting another.",
      );
    const approved = new URL(approvedPageUrl(url));
    if (!/^\/toronto\/activity\/search\/detail\/\d+$/.test(approved.pathname))
      throw new BookingStepError("Choose a City activity detail page.");
    const page = this.requirePage();
    this.state = {
      status: "preparing",
      message:
        "Checking the activity, availability and fee before opening its enrollment form…",
      timings: [],
    };
    await this.navigate(approved.href);
    await this.timing.measure("external_wait", () =>
      page
        .getByRole("heading", { name: "Activity meeting dates", exact: true })
        .waitFor(),
    );
    if (
      !(await page.getByRole("link", { name: "Sign Out", exact: true }).isVisible())
    ) {
      this.state.status = "sign_in_required";
      this.state.message =
        "The City session needs sign-in. Use Show City browser, sign in and resume.";
      return this.snapshot();
    }
    const main = page.locator("#main-content-body");
    const name = await main.getByRole("heading", { level: 1 }).innerText();
    const text = await main.innerText();
    const number = /#(\d+)/.exec(text)?.[1];
    const meeting =
      /Activity meeting dates\s+([\s\S]*?)(?:More Information|Registration dates)/
        .exec(text)?.[1]
        ?.trim();
    const location = await page
      .getByRole("link", { name: /^Activity location / })
      .getAttribute("aria-label");
    const enroll = page.getByRole("button", {
      name: /\d+ openings? remaining Enroll Now/,
    });
    if (
      !number ||
      !meeting ||
      !location ||
      !/\bFree\b/.test(text) ||
      !(await enroll.isVisible())
    )
      throw new BookingStepError(
        "This activity lacks verified availability, location, dates or free reservation pricing. Nothing was submitted.",
      );
    this.state.activity = {
      url: approved.href,
      number,
      name,
      dates: meeting,
      location: location.replace(/^Activity location /, ""),
      feeNotice:
        /It is free to reserve[^\n]*/.exec(text)?.[0] ??
        "Reservation shown as Free. Confirm the checkout total before booking.",
    };
    this.state.message = "Opening the City enrollment form…";
    await this.timing.measure("form_entry", () => enroll.click({ noWaitAfter: true }));
    await this.timing.measure("external_wait", () =>
      page
        .getByRole("combobox", { name: /Dropdown participant/ })
        .waitFor({ timeout: 30_000 }),
    );
    await this.readParticipants();
    return this.snapshot();
  }
  private async readParticipants() {
    const page = this.requirePage();
    await page.getByRole("combobox", { name: /Dropdown participant/ }).click();
    const choices = (await page.getByRole("listbox").innerText())
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!choices.length || choices.length > 20)
      throw new BookingStepError("The participant list could not be read safely.");
    this.participantChoices = new Map(choices.map((label) => [randomUUID(), label]));
    this.state.participants = [...this.participantChoices].map(([id, label]) => ({
      id,
      label,
    }));
    this.state.status = "participant_required";
    this.state.message =
      "Choose the participant from your City account. Nothing is reserved yet.";
  }
  async selectParticipant(id: string) {
    const label = this.participantChoices?.get(id);
    if (!label || this.state.status !== "participant_required")
      throw new BookingStepError("Choose a current participant from this session.");
    const page = this.requirePage();
    await this.timing.measure("form_entry", () =>
      page.getByRole("listbox").getByText(label, { exact: true }).click(),
    );
    this.state.status = "preparing";
    this.state.message = "Checking the participant form and checkout requirements…";
    await this.timing.measure("external_wait", () =>
      page.getByText("loading", { exact: true }).waitFor({ state: "hidden" }),
    );
    // Unknown questions, waivers and signatures require resident input; do not invent answers.
    const form = page.locator("#main-content-body");
    if (await form.locator("input:not([type=hidden]), textarea").count()) {
      this.state.status = "resident_action_required";
      this.state.message =
        "The City requires additional information. Complete the fields in the City window; leave final submission to Toronto One.";
      return this.snapshot();
    }
    const text = await form.innerText();
    if (!/Total\s*\$0\.00/.test(text))
      throw new BookingStepError(
        "A zero-dollar total could not be verified. Nothing was submitted.",
      );
    await this.timing.measure("form_entry", () =>
      page
        .getByRole("button", { name: /Fee summary.*Add to cart/ })
        .click({ noWaitAfter: true }),
    );
    await this.timing.measure("external_wait", () =>
      page
        .getByRole("heading", { name: "Shopping Cart", exact: true })
        .waitFor({ timeout: 30_000 }),
    );
    return this.reviewCart();
  }
  private async readActivity(page: Page, url: string) {
    await this.timing.measure("navigation", () =>
      page.goto(approvedPageUrl(url), { waitUntil: "commit" }),
    );
    await this.timing.measure("page_loading", () =>
      page.waitForLoadState("domcontentloaded"),
    );
    await this.timing.measure("external_wait", () =>
      page
        .getByRole("heading", { name: "Activity meeting dates", exact: true })
        .waitFor(),
    );
    const main = page.locator("#main-content-body");
    const text = await main.innerText();
    const number = /#(\d+)/.exec(text)?.[1];
    const dates =
      /Activity meeting dates\s+([\s\S]*?)(?:More Information|Registration dates)/
        .exec(text)?.[1]
        ?.trim();
    const location = await page
      .getByRole("link", { name: /^Activity location / })
      .getAttribute("aria-label");
    if (!number || !dates || !location)
      throw new BookingStepError("The activity cannot be verified.");
    return {
      url,
      number,
      name: await main.getByRole("heading", { level: 1 }).innerText(),
      dates,
      location: location.replace(/^Activity location /, ""),
      feeNotice:
        /It is free to reserve[^\n]*/.exec(text)?.[0] ??
        "Check the current City fees before booking.",
    };
  }
  private async cartPayload(): Promise<CheckoutPayload> {
    const page = this.requirePage();
    if (!/^\/toronto\/newcart$/.test(new URL(page.url()).pathname))
      throw new BookingStepError("The City checkout page changed.");
    const main = page.locator("#main-content-body");
    const text = await main.innerText();
    const links = await main.locator("a[href]").evaluateAll((elements) =>
      elements.map((e) => ({
        href: e.getAttribute("href") ?? "",
        text: e.textContent ?? "",
      })),
    );
    const activities = [
      ...new Set(
        links
          .map((l) => normalizeCityLink(l.href, page.url()))
          .filter((u): u is string => Boolean(u && /\/detail\/\d+$/.test(u))),
      ),
    ];
    if (
      activities.length !== 1 ||
      !/1 item,/.test(text) ||
      !/Due Now\s*\$0\.00(?:\s|$)/.test(text) ||
      (text.match(/\$[\d,]+\.\d{2}/g) ?? []).some(
        (amount) => Number(amount.replace(/[$,]/g, "")) !== 0,
      )
    )
      throw new BookingStepError(
        "Checkout must contain exactly one activity with $0.00 due now. Review the City cart; no booking was sent.",
      );
    const url = activities[0];
    if (!url) throw new BookingStepError("The cart activity is missing.");
    if (!this.state.activity || this.state.activity.url !== url) {
      const detail = await page.context().newPage();
      try {
        this.state.activity = await this.readActivity(detail, url);
      } finally {
        await detail.close();
      }
    }
    const activity = this.state.activity;
    if (!text.includes(activity.number) || !text.includes(activity.name))
      throw new BookingStepError("The cart activity changed.");
    const participant = normalizeEvidence(
      await main
        .getByRole("heading", { level: 2 })
        .first()
        .evaluate((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const words: string[] = [];
          while (walker.nextNode()) {
            const word = walker.currentNode.textContent?.trim();
            if (word) words.push(word);
          }
          return words.join(" ");
        }),
    );
    if (!participant || participant === "Waiver")
      throw new BookingStepError("The cart participant could not be verified.");
    const checkboxes = main.getByRole("checkbox");
    if ((await checkboxes.count()) !== 1)
      throw new BookingStepError(
        "The City's waiver requirements changed. Review them in the City browser.",
      );
    const waiver =
      (await checkboxes.first().getAttribute("aria-label")) ??
      (await checkboxes.first().getAttribute("name")) ??
      "Activities: General Waiver";
    if (!(await checkboxes.first().isChecked())) {
      this.state.status = "resident_action_required";
      this.state.message =
        "Review Activities: General Waiver in the City browser and accept it yourself if you agree. Leave Finish untouched, then Resume City booking.";
      throw new BookingStepError(this.state.message);
    }
    return {
      activity: structuredClone(activity),
      participant,
      totalCents: 0,
      currency: "CAD",
      waiver,
      waiverAccepted: true,
    };
  }
  async reviewCart() {
    try {
      const payload = await this.cartPayload();
      if (await priorAttempt(payload)) {
        this.state.status = "outcome_unknown";
        this.state.message =
          "A prior booking attempt exists for this participant and activity. Reconcile it against City account/receipt evidence; another Finish is blocked.";
        return this.snapshot();
      }
      this.approval = makeCheckoutApproval(payload);
      this.state.status = "review_required";
      this.state.message =
        "City checkout verified: one activity, selected participant, resident-accepted waiver and $0.00 due now. Approve this exact reservation below.";
      this.state.review = {
        id: this.approval.id,
        digest: this.approval.digest,
        expiresAt: this.approval.expiresAt,
        participant: payload.participant,
        totalCents: 0,
        currency: "CAD",
        terms:
          "Activities: General Waiver accepted directly in the City interface. Check-in fees may apply as disclosed above.",
      };
    } catch (error) {
      if (this.state.status !== "resident_action_required") throw error;
    }
    return this.snapshot();
  }
  async finish(id: string, digest: string) {
    if (this.state.status !== "review_required")
      throw new BookingStepError("Review the exact City checkout before approving.");
    const current = await this.cartPayload();
    const plan = verifyCheckoutApproval(this.approval, id, digest, current);
    await recordOutboundAttempt(plan);
    plan.consumed = true;
    const executionStarted = performance.now();
    this.state.status = "executing";
    this.state.message =
      "Sending the approved zero-dollar reservation to the City. Waiting for an official receipt…";
    const page = this.requirePage();
    try {
      // Exactly one final click, with no retry even if the browser disconnects.
      await this.timing.measure("form_entry", () =>
        page
          .getByRole("button", { name: "Finish", exact: true })
          .click({ noWaitAfter: true }),
      );
      await this.timing.measure("external_wait", () =>
        page
          .getByText(
            /Receipt (?:number|#)|Order (?:number|#)|Transaction (?:completed|successful)|Thank you for your/i,
          )
          .first()
          .waitFor({ timeout: 45_000 }),
      );
      await this.captureReceipt();
      try {
        this.state.message =
          "Reservation and account match verified. Capturing the official printable receipt…";
        await this.capturePrintableReceipt();
        this.state.message =
          "Reservation confirmed: official printable receipt captured and enrollment matched in your City account.";
      } catch {
        // A document-download failure cannot erase a verified City enrollment or
        // authorize another Finish. Preserve its official confirmation and reference.
        this.state.message =
          "Reservation confirmed in the City account; official confirmation captured. The printable receipt export needs attention. Retry only the receipt capture.";
      }
    } catch {
      this.state.status = "outcome_unknown";
      this.state.message =
        "Finish was attempted once. The official outcome is not verified. Do not book again; use Reconcile to inspect the existing receipt and City account.";
    } finally {
      this.state.executionMs = Math.round(performance.now() - executionStarted);
    }
    return this.snapshot();
  }
  async captureReceipt() {
    await this.refreshNavigationPolicy();
    const page = this.requirePage();
    if (!this.approval?.consumed)
      throw new BookingStepError("No approved attempt exists to reconcile.");
    const plan = this.approval;
    const text = await page.locator("body").innerText();
    await mkdir(privateBookingDirectory, { recursive: true, mode: 0o700 });
    this.receiptFile = path.join(privateBookingDirectory, `${plan.id}-receipt.png`);
    await writeFile(this.receiptFile, await page.screenshot({ fullPage: true }), {
      mode: 0o600,
    });
    const receiptNumber = extractReceiptNumber(text);
    if (
      !receiptNumber ||
      !text.includes(plan.payload.activity.number) ||
      !normalizeEvidence(text)
        .replaceAll(" ", "")
        .includes(plan.payload.participant.replaceAll(" ", ""))
    )
      throw new BookingStepError(
        "An official receipt matching this activity and participant has not been verified.",
      );
    this.state.receipt = {
      number: receiptNumber,
      capturedAt: new Date().toISOString(),
      accountVerified: false,
      evidenceUrl: this.receiptPdfFile
        ? appPath("/api/recreation/receipt?format=pdf")
        : appPath("/api/recreation/receipt"),
    };
    this.state.status = "outcome_unknown";
    this.state.message =
      "Official receipt captured. Verifying that the same reservation appears in the City account…";
    const account = await page.context().newPage();
    try {
      await this.timing.measure("navigation", () =>
        account.goto(`${origin}/toronto/myaccount?onlineSiteId=0`, {
          waitUntil: "domcontentloaded",
        }),
      );
      await this.timing.measure("form_entry", () =>
        account
          .getByRole("link", { name: "Transaction and Payment History", exact: true })
          .click({ noWaitAfter: true }),
      );
      await this.timing.measure("external_wait", () =>
        account
          .getByText(receiptNumber, { exact: false })
          .first()
          .waitFor({ timeout: 25_000 }),
      );
      await this.timing.measure("external_wait", () =>
        account
          .getByText("loading", { exact: true })
          .waitFor({ state: "hidden", timeout: 12_000 }),
      );
      const record = await account
        .getByRole("link", { name: `receipt ${receiptNumber}`, exact: true })
        .evaluate((element) => {
          let parent = element.parentElement;
          for (
            let depth = 0;
            parent && depth < 7;
            depth++, parent = parent.parentElement
          ) {
            const text = parent.innerText;
            if (
              parent.querySelectorAll('a[href*="/receipt"]').length !== 1 ||
              text.length > 2500
            )
              break;
            if (/Registrations/.test(text) && /\bEnroll\b/.test(text)) return text;
          }
          return "";
        });
      const receiptHref = await account
        .getByRole("link", { name: `receipt ${receiptNumber}`, exact: true })
        .getAttribute("href");
      if (!receiptHref)
        throw new BookingStepError("The matching account receipt link is missing.");
      const receiptUrl = new URL(receiptHref, account.url());
      if (receiptUrl.origin !== origin || receiptUrl.pathname !== "/toronto/receipt")
        throw new BookingStepError(
          "The account receipt left the reviewed City tenant.",
        );
      this.receiptSourceUrl = receiptUrl.href;
      if (
        !record.includes(plan.payload.activity.number) ||
        !normalizeEvidence(record)
          .replaceAll(" ", "")
          .includes(plan.payload.participant.replaceAll(" ", "")) ||
        !record.includes("$0.00")
      )
        throw new BookingStepError(
          "The account receipt exists, but the matching participant/activity enrollment has not been verified.",
        );
      await writeFile(
        path.join(privateBookingDirectory, `${plan.id}-account.png`),
        await account.screenshot({ fullPage: true }),
        { mode: 0o600 },
      );
      await recordConfirmedAttempt(plan, receiptNumber);
      this.state.receipt.accountVerified = true;
      this.state.status = "confirmed";
      this.state.message =
        "Reservation confirmed: official receipt captured and matched in your City account.";
    } finally {
      await account.close();
    }
    return this.snapshot();
  }
  receiptPath() {
    return this.receiptFile;
  }
  async capturePrintableReceipt() {
    await this.refreshNavigationPolicy();
    const page = this.requirePage();
    const approval = this.approval;
    const receipt = this.state.receipt;
    if (!approval?.consumed || !receipt)
      throw new BookingStepError("Capture the matching official confirmation first.");
    const href =
      this.receiptSourceUrl ??
      (await page
        .getByRole("link", { name: "View printable receipt", exact: true })
        .getAttribute("href"));
    const url = href ? new URL(href, page.url()) : null;
    if (!url || url.origin !== origin || url.pathname !== "/toronto/receipt")
      throw new BookingStepError("The City's printable receipt destination changed.");
    const warm = page
      .context()
      .pages()
      .find((candidate) => {
        if (candidate.isClosed()) return false;
        const current = new URL(candidate.url());
        return (
          current.origin === origin &&
          current.pathname === "/toronto/receipt" &&
          (url.searchParams.has("receiptId")
            ? current.searchParams.get("receiptId") ===
              url.searchParams.get("receiptId")
            : current.href === url.href)
        );
      });
    const printable = warm ?? (await page.context().newPage());
    try {
      if (!warm) {
        // Printing is captured server-side; no OS print dialog or document edits.
        await printable.addInitScript(() => {
          window.print = () => undefined;
        });
        await this.timing.measure("navigation", () =>
          printable.goto(url.href, { waitUntil: "commit" }),
        );
      }
      await this.timing.measure("external_wait", () =>
        printable
          .getByRole("heading", { name: /Receipt Number/i })
          .filter({ hasText: receipt.number })
          .waitFor({ timeout: 25_000 }),
      );
      const text = normalizeEvidence(await printable.locator("body").innerText());
      if (
        !text.includes(receipt.number) ||
        !text.includes(approval.payload.activity.number) ||
        !text
          .replaceAll(" ", "")
          .includes(approval.payload.participant.replaceAll(" ", ""))
      )
        throw new BookingStepError(
          "The printable receipt does not match this reservation.",
        );
      this.receiptFile = path.join(
        privateBookingDirectory,
        `${approval.id}-official-receipt.png`,
      );
      await writeFile(
        this.receiptFile,
        await printable.screenshot({ fullPage: true }),
        { mode: 0o600 },
      );
      const pdfFile = path.join(
        privateBookingDirectory,
        `${approval.id}-official-receipt.pdf`,
      );
      await writeFile(
        pdfFile,
        await printable.pdf({ format: "Letter", printBackground: true }),
        { mode: 0o600 },
      );
      this.receiptPdfFile = pdfFile;
      receipt.evidenceUrl = appPath("/api/recreation/receipt?format=pdf");
    } finally {
      if (!warm) await printable.close();
    }
    return this.snapshot();
  }
  receiptPdfPath() {
    return this.receiptPdfFile;
  }
  async close() {
    this.residentPaused = false;
    this.pendingActivityUrl = undefined;
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    await closeResidentDesktop(this.owner);
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
    this.state = {
      status: "disconnected",
      message: "City browser disconnected and its in-memory credentials cleared.",
      timings: [],
    };
  }
}
