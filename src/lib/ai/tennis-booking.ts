import type { Page, Locator } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { appPath } from "../app-path.ts";
import { privateBookingDirectory, extractReceiptNumber } from "./booking-approval.ts";
import type { BookingState } from "./booking-contracts.ts";
import {
  journalTennisAttempt,
  makeTennisApproval,
  priorTennisAttempt,
  verifyTennisApproval,
  type TennisApproval,
} from "./tennis-approval.ts";
import {
  tennisBookingUrl,
  TennisStepError,
  readTennisCheckout,
  validateTennisRequest,
  verifyTennisPermit,
  matchesTennisIdentity,
  containsTennisReference,
  type TennisRequest,
  type TennisResource,
} from "./tennis-contracts.ts";

const origin = new URL(tennisBookingUrl).origin;
export async function selectTennisDate(page: Page, date: string) {
  const picker = page.getByRole("combobox", { name: /Date picker/ });
  await picker.click();
  const value = new Date(`${date}T12:00:00Z`);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
  let day = page.getByLabel(label, { exact: true });
  if (!(await day.count())) {
    await page
      .getByRole("button", {
        name: "Switch calendar to next month right arrow",
        exact: true,
      })
      .click();
    day = page.getByLabel(label, { exact: true });
  }
  if ((await day.count()) !== 1 || (await day.getAttribute("aria-disabled")) === "true")
    throw new TennisStepError(
      "The City does not offer that date for this court. Choose another date in the City calendar.",
    );
  await day.click();
}

async function accountReservationRecord(receipt: Locator) {
  return receipt.evaluate((element) => {
    let parent = element.parentElement;
    for (let depth = 0; parent && depth < 8; depth++, parent = parent.parentElement) {
      const text = parent.innerText;
      if (
        text.length > 6000 ||
        parent.querySelectorAll('a[href*="/receipt"]').length !== 1
      )
        break;
      if (/Reservation|Permit|Facility Booking/i.test(text))
        return {
          text,
          links: [...parent.querySelectorAll("a[href]")].map((a) => ({
            name: a.textContent ?? "",
            href: a.getAttribute("href") ?? "",
          })),
        };
    }
    return undefined;
  });
}

/** Human checkout: never calls Pay, Finish, agreement controls or signature fields.
 * All account/cart/permit data stays in this private adapter, outside model tools.
 */
export class TennisBooking {
  private resource: TennisResource;
  private request: TennisRequest | undefined;
  private approval: TennisApproval | undefined;
  private state: BookingState;
  private receiptFile: string | undefined;
  private pdfFile: string | undefined;
  private prepared = false;
  private permitSourceUrl: string | undefined;
  private renderPdf: (page: Page) => Promise<Buffer>;
  private directory: string;
  private now: () => Date;
  constructor(
    resource: TennisResource,
    options: {
      directory?: string;
      now?: () => Date;
      renderPdf?: (page: Page) => Promise<Buffer>;
    } = {},
  ) {
    this.directory = options.directory ?? privateBookingDirectory;
    this.now = options.now ?? (() => new Date());
    this.renderPdf =
      options.renderPdf ??
      ((page) => page.pdf({ format: "Letter", printBackground: true }));
    this.resource = structuredClone(resource);
    this.state = {
      status: "facility_details_required",
      facility: this.resource,
      message:
        "Choose your date, one-hour court time and group size. Availability and charges will be checked with the City.",
      timings: [],
    };
  }
  snapshot(): BookingState {
    return {
      ...this.state,
      ...(this.state.facilityReview
        ? {
            facilityReview: {
              ...this.state.facilityReview,
              expired: Date.now() >= this.state.facilityReview.expiresAt,
            },
          }
        : {}),
      canReconcile: this.approval?.consumed ?? false,
    };
  }
  setRequest(input: unknown) {
    if (this.approval?.consumed)
      throw new TennisStepError(
        "Reconcile the existing reservation before starting another.",
      );
    this.request = validateTennisRequest(input, this.now());
    this.state.facility = { ...this.resource, request: this.request };
    this.state.status = "preparing";
  }
  async prepare(page: Page) {
    if (!this.request) throw new TennisStepError("Choose a court date and time first.");
    if (this.approval?.consumed) return this.verifyPermit(page);
    await page.goto(tennisBookingUrl, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Quick reservation", exact: true })
      .waitFor();
    if (await page.getByRole("link", { name: "Sign In", exact: true }).isVisible()) {
      this.state.status = "sign_in_required";
      this.state.message =
        "Sign in directly with the City, then continue to check court availability.";
      return this.snapshot();
    }
    await selectTennisDate(page, this.request.date);
    const court = page.getByRole("link", { name: this.resource.name, exact: true });
    if ((await court.count()) !== 1)
      throw new TennisStepError(
        "The selected court is not listed on the City schedule for this date. No alternative court was selected.",
      );
    await court.scrollIntoViewIfNeeded();
    this.prepared = true;
    this.state.status = "resident_action_required";
    this.state.message =
      "Select who the booking is for and the requested court time in the City schedule. Review the booking details and personally complete any required legal declarations or signatures to reach your cart. Leave final payment untouched until the reservation review below. A blank or unavailable slot is not a reservation.";
    return this.snapshot();
  }
  async resume(page: Page) {
    if (this.approval?.consumed) return this.verifyPermit(page);
    return this.prepared ? this.review(page) : this.prepare(page);
  }
  async review(page: Page) {
    if (this.approval?.consumed) return this.verifyPermit(page);
    if (!this.request) throw new TennisStepError("Choose a court date and time first.");
    const current = new URL(page.url());
    if (current.origin !== origin || current.pathname !== "/toronto/newcart") {
      this.state.status = "resident_action_required";
      this.state.message =
        "Continue the selected court reservation to the City cart, then choose Review City cart here. You complete all City declarations, signatures and payment yourself.";
      return this.snapshot();
    }
    const payload = readTennisCheckout(
      await page.locator("#main-content-body").innerText(),
      this.resource,
      this.request,
    );
    if (await priorTennisAttempt(payload, this.directory)) {
      this.state.status = "outcome_unknown";
      this.state.message =
        "An earlier checkout handoff exists for this court, person and time. Check the existing City booking instead of paying again.";
      return this.snapshot();
    }
    this.approval = makeTennisApproval(payload);
    this.state.facility = {
      ...this.resource,
      request: this.request,
      participant: payload.participant,
      totalCents: payload.totalCents,
    };
    this.state.facilityReview = {
      id: this.approval.id,
      digest: this.approval.digest,
      expiresAt: this.approval.expiresAt,
      participant: payload.participant,
      totalCents: payload.totalCents,
      currency: "CAD",
    };
    this.state.status = "review_required";
    this.state.message =
      "Review the exact court, time, booking name and charges. Continue to the City browser to personally accept its legal terms and complete payment.";
    return this.snapshot();
  }
  async authorizeCheckout(page: Page, id: string, digest: string) {
    if (
      !this.request ||
      this.state.status !== "review_required" ||
      new URL(page.url()).origin !== origin ||
      new URL(page.url()).pathname !== "/toronto/newcart"
    )
      throw new TennisStepError("Review the current City cart before continuing.");
    const current = readTennisCheckout(
      await page.locator("#main-content-body").innerText(),
      this.resource,
      this.request,
    );
    const approval = verifyTennisApproval(this.approval, id, digest, current);
    await journalTennisAttempt(approval, undefined, this.directory);
    approval.consumed = true;
    this.state.status = "resident_checkout_required";
    this.state.message =
      "You control the City checkout. Review and accept legal terms, sign where required and pay directly with the City only if the court, time and total still match. When finished, return here to verify your permit. Do not repeat payment if the outcome is unclear.";
    delete this.state.facilityReview;
    return this.snapshot();
  }
  async verifyPermit(page: Page) {
    const approval = this.approval;
    if (!approval?.consumed)
      throw new TennisStepError(
        "No reviewed City checkout handoff exists to verify. Do not create a new booking to obtain a receipt.",
      );
    if (this.state.status === "confirmed") return this.snapshot();
    this.state.status = "outcome_unknown";
    this.state.message =
      "Checking the existing City receipt and permit. No payment or reservation will be retried.";
    const text = await page.locator("body").innerText();
    let receiptNumber = extractReceiptNumber(text);
    const account = await page.context().newPage();
    let permit: Page | undefined;
    try {
      await account.goto(`${origin}/toronto/myaccount?onlineSiteId=0`, {
        waitUntil: "domcontentloaded",
      });
      await account
        .getByRole("link", { name: "Transaction and Payment History", exact: true })
        .click({ noWaitAfter: true });
      if (!receiptNumber) {
        const receiptLinks = account.getByRole("link", {
          name: /^receipt [A-Z0-9.-]+$/i,
        });
        await receiptLinks.first().waitFor({ timeout: 25_000 });
        const matches: string[] = [];
        for (const link of (await receiptLinks.all()).slice(0, 100)) {
          const candidate = await accountReservationRecord(link);
          if (
            candidate &&
            matchesTennisIdentity(
              candidate.text,
              this.resource,
              approval.payload.request,
              approval.payload.participant,
            )
          ) {
            const name =
              (await link.getAttribute("aria-label")) ?? (await link.innerText());
            const number = /^receipt\s+([A-Z0-9.-]+)$/i.exec(name.trim())?.[1];
            if (number && /\d/.test(number)) matches.push(number);
          }
        }
        if (matches.length !== 1)
          throw new TennisStepError(
            "A unique matching reservation was not found in the City account. Do not pay again; inspect the existing transaction with the City.",
          );
        receiptNumber = matches[0];
      }
      if (!receiptNumber)
        throw new TennisStepError("The matching City receipt number is missing.");
      const receipt = account.getByRole("link", {
        name: `receipt ${receiptNumber}`,
        exact: true,
      });
      await receipt.waitFor({ timeout: 25_000 });
      const record = await accountReservationRecord(receipt);
      if (!record)
        throw new TennisStepError(
          "The City account receipt is present, but its matching facility reservation record has not been verified.",
        );
      const permitLink = record.links.find((link) => /permit/i.test(link.name));
      const receiptHref = await receipt.getAttribute("href");
      const href = permitLink?.href ?? receiptHref;
      const documentUrl = href ? new URL(href, account.url()) : undefined;
      if (
        !documentUrl ||
        documentUrl.origin !== origin ||
        !/^\/toronto\/(?:receipt|reservation\/[^?#]*permit[^?#]*)\/?$/i.test(
          documentUrl.pathname,
        )
      )
        throw new TennisStepError(
          "The City permit destination is outside the reviewed reservation document paths.",
        );
      permit = await page.context().newPage();
      await permit.addInitScript(() => {
        window.print = () => undefined;
      });
      await permit.goto(documentUrl.href, { waitUntil: "domcontentloaded" });
      await permit
        .getByText(/(?:Permit|Reservation|Booking)\s*(?:Number|#|No\.|:)/i)
        .first()
        .waitFor({ timeout: 25_000 });
      const permitText = await permit.locator("body").innerText();
      const permitNumber = verifyTennisPermit(
        permitText,
        record.text,
        approval.payload,
        receiptNumber,
      );
      const id = randomUUID();
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const imagePath = path.join(this.directory, `${id}-permit.png`);
      const pdfPath = path.join(this.directory, `${id}-permit.pdf`);
      await writeFile(imagePath, await permit.screenshot({ fullPage: true }), {
        mode: 0o600,
      });
      await journalTennisAttempt(approval, permitNumber, this.directory);
      this.receiptFile = imagePath;
      this.permitSourceUrl = documentUrl.href;
      this.state.receipt = {
        number: receiptNumber,
        permitNumber,
        documentKind: "permit",
        capturedAt: new Date().toISOString(),
        accountVerified: true,
        evidenceUrl: appPath("/api/recreation/receipt"),
      };
      this.state.status = "confirmed";
      this.state.message =
        "Official court permit captured and matched to the same court, time, booking name and charges in your City account.";
      try {
        await writeFile(pdfPath, await this.renderPdf(permit), { mode: 0o600 });
        this.pdfFile = pdfPath;
        this.state.receipt.evidenceUrl = appPath("/api/recreation/receipt?format=pdf");
      } catch {
        this.state.message =
          "Court permit and City account verified. The official permit image is available; PDF export needs attention and can be retried without another reservation.";
      }
      return this.snapshot();
    } finally {
      await permit?.close();
      await account.close();
    }
  }
  async capturePrintablePermit(page: Page) {
    if (
      this.state.status !== "confirmed" ||
      !this.state.receipt?.permitNumber ||
      !this.permitSourceUrl ||
      !this.approval?.consumed
    )
      throw new TennisStepError(
        "Verify the existing official permit before exporting it.",
      );
    const printable = await page.context().newPage();
    try {
      await printable.addInitScript(() => {
        window.print = () => undefined;
      });
      await printable.goto(this.permitSourceUrl, { waitUntil: "domcontentloaded" });
      await printable
        .getByText(/(?:Permit|Reservation|Booking)\s*(?:Number|#|No\.|:)/i)
        .first()
        .waitFor({ timeout: 25_000 });
      const text = await printable.locator("body").innerText();
      if (
        !containsTennisReference(text, this.state.receipt.permitNumber) ||
        !matchesTennisIdentity(
          text,
          this.resource,
          this.approval.payload.request,
          this.approval.payload.participant,
        )
      )
        throw new TennisStepError(
          "The printable document no longer matches the verified court permit.",
        );
      const pdfPath = path.join(this.directory, `${randomUUID()}-permit.pdf`);
      await writeFile(pdfPath, await this.renderPdf(printable), { mode: 0o600 });
      this.pdfFile = pdfPath;
      this.state.receipt.evidenceUrl = appPath("/api/recreation/receipt?format=pdf");
      return this.snapshot();
    } finally {
      await printable.close();
    }
  }
  receiptPath() {
    return this.receiptFile;
  }
  receiptPdfPath() {
    return this.pdfFile;
  }
}
