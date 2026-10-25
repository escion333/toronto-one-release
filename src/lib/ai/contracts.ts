import { z } from "zod";
import type { MascotState } from "../demo/types.ts";

export const factSchema = z.object({
  label: z.string().min(1).max(70),
  quote: z.string().min(3).max(1200),
});
export const resultInputSchema = z.object({
  kind: z.enum(["voting", "recreation", "guidance"]),
  observationId: z.string().uuid(),
  facts: z.array(factSchema).min(1).max(10),
});
export const cityResultSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["voting", "recreation", "guidance"]),
  title: z.string(),
  sourceUrl: z.string().url(),
  checkedAt: z.string(),
  facts: z.array(factSchema.extend({ sourceUrl: z.string().url().optional() })),
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
