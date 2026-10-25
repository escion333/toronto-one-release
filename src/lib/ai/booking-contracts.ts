import { z } from "zod";
import type { MascotState } from "../demo/types.ts";
export const activitySchema = z.object({
  url: z.string().url(),
  number: z.string(),
  name: z.string(),
  dates: z.string(),
  location: z.string(),
  feeNotice: z.string(),
});
export const bookingStateSchema = z.object({
  status: z.enum([
    "disconnected",
    "sign_in_required",
    "ready",
    "preparing",
    "participant_required",
    "resident_action_required",
    "review_required",
    "executing",
    "outcome_unknown",
    "confirmed",
    "needs_attention",
  ]),
  message: z.string(),
  executionMs: z.number().optional(),
  canReconcile: z.boolean().optional(),
  operations: z
    .array(
      z.object({
        action: z.string(),
        elapsedMs: z.number(),
        ok: z.boolean(),
        phases: z.array(
          z.object({ phase: z.string(), ms: z.number(), ok: z.boolean() }),
        ),
      }),
    )
    .optional(),
  activity: activitySchema.optional(),
  participants: z
    .array(z.object({ id: z.string().uuid(), label: z.string() }))
    .optional(),
  review: z
    .object({
      id: z.string().uuid(),
      digest: z.string(),
      expiresAt: z.number(),
      expired: z.boolean().optional(),
      participant: z.string(),
      totalCents: z.literal(0),
      currency: z.literal("CAD"),
      terms: z.string(),
    })
    .optional(),
  receipt: z
    .object({
      number: z.string(),
      capturedAt: z.string(),
      accountVerified: z.boolean(),
      evidenceUrl: z.string(),
    })
    .optional(),
  timings: z.array(z.object({ phase: z.string(), ms: z.number(), ok: z.boolean() })),
});
export type BookingState = z.infer<typeof bookingStateSchema>;
export type BookingActivity = z.infer<typeof activitySchema>;

export function bookingMascotState(input: {
  base: MascotState;
  status: BookingState["status"] | undefined;
  busy: boolean;
  error: boolean;
  activeChat: boolean;
  focused: boolean;
}): MascotState {
  if (input.activeChat) return input.base;
  if (input.busy || input.status === "preparing" || input.status === "executing")
    return "working";
  if (
    input.error ||
    input.status === "outcome_unknown" ||
    input.status === "needs_attention" ||
    input.base === "error"
  )
    return "error";
  if (input.focused) return "listening";
  if (
    [
      "participant_required",
      "resident_action_required",
      "review_required",
      "sign_in_required",
    ].includes(input.status ?? "")
  )
    return "needs_input";
  if (input.status === "confirmed") return "success";
  return input.base;
}
