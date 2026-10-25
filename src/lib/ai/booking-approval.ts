import { durableStore } from "./durable-store.ts";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { BookingActivity } from "./booking-contracts.ts";

export type CheckoutPayload = {
  activity: BookingActivity;
  participant: string;
  totalCents: 0;
  currency: "CAD";
  waiver: string;
  waiverAccepted: true;
};
export type CheckoutApproval = {
  id: string;
  digest: string;
  expiresAt: number;
  payload: CheckoutPayload;
  consumed: boolean;
};
const digestOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function makeCheckoutApproval(
  payload: CheckoutPayload,
  now = Date.now(),
): CheckoutApproval {
  const id = randomUUID();
  const snapshot = structuredClone(payload);
  return {
    id,
    payload: snapshot,
    digest: digestOf({ id, payload: snapshot }),
    expiresAt: now + 5 * 60_000,
    consumed: false,
  };
}
export function verifyCheckoutApproval(
  plan: CheckoutApproval | undefined,
  id: string,
  digest: string,
  current: CheckoutPayload,
  now = Date.now(),
) {
  if (
    !plan ||
    plan.consumed ||
    plan.id !== id ||
    plan.digest !== digest ||
    now >= plan.expiresAt ||
    digestOf({ id, payload: plan.payload }) !== digest ||
    digestOf(current) !== digestOf(plan.payload)
  )
    throw new Error(
      "The booking review changed, expired or was already used. Review the current City checkout again.",
    );
  if (current.totalCents !== 0 || !current.waiverAccepted)
    throw new Error(
      "This local adapter requires zero due now and resident-accepted City terms.",
    );
  return plan;
}
export const privateBookingDirectory =
  process.env.PRIVATE_DATA_DIR ?? path.join(process.cwd(), ".local", "booking");
export function attemptKey(payload: CheckoutPayload) {
  return digestOf({
    activity: payload.activity.url,
    participant: payload.participant.trim().toLocaleLowerCase("en-CA"),
  });
}
export async function priorAttempt(
  payload: CheckoutPayload,
  directory = privateBookingDirectory,
) {
  if (process.env.PRIVATE_STORE_URL && directory === privateBookingDirectory)
    return durableStore("exists", attemptKey(payload));
  try {
    await readFile(
      /* turbopackIgnore: true */ path.join(directory, `${attemptKey(payload)}.json`),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}
export async function recordOutboundAttempt(
  plan: CheckoutApproval,
  directory = privateBookingDirectory,
) {
  if (process.env.PRIVATE_STORE_URL && directory === privateBookingDirectory) {
    await durableStore("claim", attemptKey(plan.payload));
    return;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = await open(
    path.join(directory, `${attemptKey(plan.payload)}.json`),
    "wx",
    0o600,
  );
  try {
    // Durable intent precedes Finish. A restart cannot silently submit it again.
    await file.writeFile(
      JSON.stringify({
        status: "outcome_unknown",
        approvalId: plan.id,
        digest: plan.digest,
        activity: plan.payload.activity.number,
        sentAt: new Date().toISOString(),
      }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  // Runtime directory fsync, not a build input. Never trace private local evidence.
  const directoryHandle = await open(/* turbopackIgnore: true */ directory, "r");
  try {
    await directoryHandle.sync();
  } finally {
    await directoryHandle.close();
  }
}
export async function recordConfirmedAttempt(
  plan: CheckoutApproval,
  receiptNumber: string,
  directory = privateBookingDirectory,
) {
  if (process.env.PRIVATE_STORE_URL && directory === privateBookingDirectory) {
    await durableStore("confirm", attemptKey(plan.payload));
    return;
  }
  const destination = path.join(directory, `${attemptKey(plan.payload)}.json`);
  const previous = z
    .object({ sentAt: z.string().optional() })
    .parse(JSON.parse(await readFile(/* turbopackIgnore: true */ destination, "utf8")));
  const temporary = `${destination}.tmp`;
  const file = await open(temporary, "w", 0o600);
  try {
    await file.writeFile(
      JSON.stringify({
        status: "confirmed",
        ...previous,
        approvalId: plan.id,
        digest: plan.digest,
        activity: plan.payload.activity.number,
        receiptNumber,
        confirmedAt: new Date().toISOString(),
      }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, destination);
}

export function extractReceiptNumber(text: string): string | undefined {
  const number =
    /Receipt\s*(?:number|#|no\.?|:)\s*[:#]?\s*([A-Z0-9][A-Z0-9.-]{3,})/i.exec(
      text,
    )?.[1];
  return number && /\d/.test(number) ? number : undefined;
}
