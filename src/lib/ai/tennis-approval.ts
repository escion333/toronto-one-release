import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { durableStore } from "./durable-store.ts";
import { privateBookingDirectory } from "./booking-approval.ts";
import type { TennisCheckout } from "./tennis-contracts.ts";
import { TennisStepError } from "./tennis-contracts.ts";
import { z } from "zod";

const digestOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type TennisApproval = {
  id: string;
  digest: string;
  expiresAt: number;
  payload: TennisCheckout;
  consumed: boolean;
};
export function tennisAttemptKey(payload: TennisCheckout) {
  return digestOf({
    kind: "tennis",
    court: payload.name,
    date: payload.request.date,
    start: payload.request.startTime,
    duration: payload.request.durationMinutes,
    participant: payload.participant.trim().toLocaleLowerCase("en-CA"),
  });
}
export function makeTennisApproval(
  payload: TennisCheckout,
  now = Date.now(),
): TennisApproval {
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
export function verifyTennisApproval(
  plan: TennisApproval | undefined,
  id: string,
  digest: string,
  current: TennisCheckout,
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
    throw new TennisStepError(
      "The court, time, booking name or charges changed, or this review expired. Review the City cart again.",
    );
  return plan;
}
export async function priorTennisAttempt(
  payload: TennisCheckout,
  directory = privateBookingDirectory,
) {
  if (process.env.PRIVATE_STORE_URL && directory === privateBookingDirectory)
    return durableStore("exists", tennisAttemptKey(payload));
  try {
    await readFile(
      /* turbopackIgnore: true */ path.join(
        directory,
        `${tennisAttemptKey(payload)}.json`,
      ),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return false;
    throw error;
  }
}
export async function journalTennisAttempt(
  plan: TennisApproval,
  permitNumber?: string,
  directory = privateBookingDirectory,
) {
  const key = tennisAttemptKey(plan.payload);
  if (process.env.PRIVATE_STORE_URL && directory === privateBookingDirectory) {
    await durableStore(permitNumber ? "confirm" : "claim", key);
    return;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = path.join(directory, `${key}.json`);
  if (permitNumber) {
    const stored = z
      .object({
        status: z.enum(["confirmed", "outcome_unknown"]),
        approvalId: z.string(),
        digest: z.string(),
        permitNumber: z.string().optional(),
      })
      .parse(JSON.parse(await readFile(/* turbopackIgnore: true */ target, "utf8")));
    if (
      stored.approvalId !== plan.id ||
      stored.digest !== plan.digest ||
      (stored.status === "confirmed" && stored.permitNumber !== permitNumber)
    )
      throw new TennisStepError(
        "The permit does not match the recorded checkout handoff.",
      );
    if (stored.status === "confirmed") return;
  }
  const temporary = permitNumber ? `${target}.${randomUUID()}.tmp` : target;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify({
        status: permitNumber ? "confirmed" : "outcome_unknown",
        approvalId: plan.id,
        digest: plan.digest,
        ...(permitNumber ? { permitNumber } : {}),
        at: new Date().toISOString(),
      }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  if (permitNumber) await rename(temporary, target);
  const folder = await open(/* turbopackIgnore: true */ directory, "r");
  try {
    await folder.sync();
  } finally {
    await folder.close();
  }
}
