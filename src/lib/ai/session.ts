import { maxSessions, forgetRunOwner } from "./limits.ts";
import { appBasePath } from "../app-path.ts";
import { randomUUID, createHash } from "node:crypto";
import type { UIMessage } from "ai";
import { CityBrowser } from "./browser.ts";
import { RecreationBooking } from "./recreation-booking.ts";
import { ExecutionTimings } from "./timing.ts";
import {
  readBookingCheckpoint,
  writeBookingCheckpoint,
  removeBookingCheckpoint,
} from "./booking-checkpoint.ts";
import type { CityResult } from "./contracts.ts";

export const SESSION_COOKIE = "toronto-one-agent";
export const SESSION_TTL = 20 * 60_000;
export type BookingPlan = {
  id: string;
  digest: string;
  expiresAt: number;
  result: CityResult;
  consumed: boolean;
};
export type AgentSession = {
  id: string;
  browser: CityBrowser;
  booking: RecreationBooking;
  messages: UIMessage[];
  results: CityResult[];
  plans: Map<string, BookingPlan>;
  busy: boolean;
  touchedAt: number;
};
const globalSessions = globalThis as typeof globalThis & {
  torontoOneSessions?: Map<string, AgentSession>;
  torontoOneCleanup?: ReturnType<typeof setInterval>;
};
const sessions = (globalSessions.torontoOneSessions ??= new Map<
  string,
  AgentSession
>());
if (!globalSessions.torontoOneCleanup) {
  const cleanup = setInterval(() => {
    for (const [id, session] of sessions)
      if (!session.busy && Date.now() - session.touchedAt > SESSION_TTL) {
        void session.browser.close();
        void session.booking?.close();
        sessions.delete(id);
        forgetRunOwner(id);
      }
  }, 60_000);
  cleanup.unref();
  globalSessions.torontoOneCleanup = cleanup;
}
export function getSession(
  cookieHeader: string | null,
  create = true,
): AgentSession | undefined {
  const id = cookieHeader
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const now = Date.now();
  for (const [key, value] of sessions)
    if (now - value.touchedAt > SESSION_TTL && !value.busy) {
      void value.browser.close();
      void value.booking?.close();
      sessions.delete(key);
      forgetRunOwner(key);
    }
  const existing = id ? sessions.get(id) : undefined;
  if (existing) {
    // Earlier streams omitted assistant IDs; repair retained messages once so
    // refreshes cannot give React duplicate keys or merge separate replies.
    const messageIds = new Set<string>();
    for (const message of existing.messages) {
      if (!message.id || messageIds.has(message.id)) message.id = randomUUID();
      messageIds.add(message.id);
    }
    // Keep the legitimate City sign-in alive while Next hot-reloads local adapter code.
    // Browser cookies remain in the same private context; no storageState is exported.
    if (process.env.NODE_ENV === "development" && existing.booking) {
      Object.setPrototypeOf(existing.booking, RecreationBooking.prototype);
      Object.setPrototypeOf(existing.browser, CityBrowser.prototype);
      existing.browser.timing ??= new ExecutionTimings();
    }
    existing.touchedAt = now;
    return existing;
  }
  const checkpoint = id ? readBookingCheckpoint(id, now) : undefined;
  if (checkpoint && sessions.size < maxSessions) {
    const recovered: AgentSession = {
      id: checkpoint.owner,
      browser: new CityBrowser(),
      booking: new RecreationBooking(checkpoint.owner),
      messages: [],
      results: [],
      plans: new Map(),
      busy: false,
      touchedAt: now,
    };
    recovered.booking.restoreConfirmed(checkpoint);
    sessions.set(recovered.id, recovered);
    return recovered;
  }
  if (!create) return undefined;
  if (sessions.size >= maxSessions)
    throw new Error(
      "All local browser sessions are busy. Try again after a session expires.",
    );
  const sessionId = randomUUID();
  const session: AgentSession = {
    id: sessionId,
    browser: new CityBrowser(),
    booking: new RecreationBooking(sessionId),
    messages: [],
    results: [],
    plans: new Map(),
    busy: false,
    touchedAt: now,
  };
  sessions.set(session.id, session);
  return session;
}
export async function removeSession(session: AgentSession) {
  await removeBookingCheckpoint(session.id);
  await session.browser.close();
  await session.booking.close();
  sessions.delete(session.id);
  forgetRunOwner(session.id);
}
export async function saveConfirmedBooking(session: AgentSession) {
  await writeBookingCheckpoint(
    session.id,
    session.booking.snapshot(),
    session.booking.receiptPath(),
    session.booking.receiptPdfPath(),
  );
}
export function sessionCookie(session: AgentSession, secure: boolean) {
  return `${SESSION_COOKIE}=${session.id}; HttpOnly; SameSite=Strict; Path=${appBasePath || "/"}; Max-Age=${SESSION_TTL / 1000}${secure ? "; Secure" : ""}`;
}
function bookingDigest(id: string, result: CityResult) {
  return createHash("sha256")
    .update(JSON.stringify({ action: "official_site_handoff", id, result }))
    .digest("hex");
}
export function makeBookingPlan(result: CityResult, now = Date.now()): BookingPlan {
  const id = randomUUID();
  const snapshot = structuredClone(result);
  return {
    id,
    digest: bookingDigest(id, snapshot),
    expiresAt: now + 5 * 60_000,
    result: snapshot,
    consumed: false,
  };
}
export function approvedBookingPlan(
  session: Pick<AgentSession, "plans">,
  id: string,
  digest: string,
  now = Date.now(),
): BookingPlan {
  const plan = session.plans.get(id);
  if (
    !plan ||
    plan.consumed ||
    plan.digest !== digest ||
    bookingDigest(plan.id, plan.result) !== plan.digest ||
    now >= plan.expiresAt
  )
    throw new Error(
      "This preview is missing, changed, used or expired. Ask the raccoon to check the activity again.",
    );
  return plan;
}
