import { z } from "zod";
import type { MascotState } from "../demo/types.ts";
import { tennisResourceSchema } from "./tennis-contracts.ts";

export const factSchema = z.object({
  label: z.string().min(1).max(70),
  quote: z.string().min(3).max(1200),
});
export const resultInputSchema = z.object({
  kind: z.enum(["voting", "recreation", "facility", "guidance"]),
  facilityName: z.string().min(5).max(180).optional(),
  observationId: z.string().uuid(),
  facts: z.array(factSchema).min(1).max(10),
});
export const votingLookupSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("address"), address: z.string() }),
  z.object({
    type: z.literal("intersection"),
    address: z.string(),
    intersection: z.string(),
    publicPlace: z.string(),
    distanceMetres: z.number().nonnegative().max(1500),
    intersectionSourceUrl: z.string().url(),
    publicPlaceSourceUrl: z.string().url(),
  }),
]);
export type VotingLookup = z.infer<typeof votingLookupSchema>;
export const votingDetailsSchema = z.object({
  lookup: votingLookupSchema,
  venue: z.object({ name: z.string(), address: z.string() }).optional(),
});
export const citationInputSchema = z.object({
  observationId: z.string().uuid(),
  excerpts: z.array(factSchema).min(1).max(10),
});
export const sourceCitationSchema = citationInputSchema.extend({
  url: z.string().url(),
  title: z.string(),
  checkedAt: z.string().datetime(),
});
export type SourceCitation = z.infer<typeof sourceCitationSchema>;
export const cityResultSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["voting", "recreation", "facility", "guidance"]),
  title: z.string(),
  sourceUrl: z.string().url(),
  checkedAt: z.string(),
  voting: votingDetailsSchema.optional(),
  facility: tennisResourceSchema.optional(),
  facts: z.array(factSchema.extend({ sourceUrl: z.string().url().optional() })),
  sources: z.array(sourceCitationSchema).optional(),
  status: z.enum(["information_found", "requires_official_booking"]),
  handoff: z.object({ url: z.string().url(), checkedAt: z.string() }).optional(),
  plan: z
    .object({ id: z.string().uuid(), digest: z.string(), expiresAt: z.number() })
    .optional(),
});
export type CityResult = z.infer<typeof cityResultSchema>;
export const agentStateLabels: Record<MascotState, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  thinking: "Thinking it through",
  working: "Checking official services",
  success: "Sourced result ready",
  needs_input: "Over to you",
  error: "Let’s sort this out",
};
export function agentMascotState(input: {
  status: string;
  focused: boolean;
  toolRunning: boolean;
  needsInput: boolean;
  hasResult: boolean;
  toolFailed: boolean;
}): MascotState {
  if (input.status === "error") return "error";
  if (input.status === "submitted" || input.status === "streaming")
    return input.toolRunning ? "working" : "thinking";
  if (input.toolFailed) return "error";
  if (input.focused) return "listening";
  if (input.needsInput) return "needs_input";
  if (input.hasResult) return "success";
  return "idle";
}
