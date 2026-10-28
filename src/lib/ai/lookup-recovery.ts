import { z } from "zod";
import { CITY_ENTRY_POINTS } from "./policy.ts";

const serviceSchema = z.enum(["voting", "recreation", "public"]);
const codeSchema = z.enum([
  "redirected",
  "maintenance",
  "timeout",
  "temporary",
  "page_changed",
  "human_verification",
  "unavailable",
]);
export type LookupService = z.infer<typeof serviceSchema>;
export type LookupCode = z.infer<typeof codeSchema>;

export class CityLookupError extends Error {
  readonly code: LookupCode;
  constructor(code: LookupCode) {
    super(code);
    this.code = code;
    this.name = "CityLookupError";
  }
}

export function knownLookupCode(error: unknown): LookupCode | undefined {
  // Development hot reload can preserve an exception from the previous module.
  if (
    typeof error !== "object" ||
    error === null ||
    !("name" in error) ||
    error.name !== "CityLookupError" ||
    !("code" in error)
  )
    return undefined;
  const parsed = codeSchema.safeParse(error.code);
  return parsed.success ? parsed.data : undefined;
}

export function lookupErrorCode(error: unknown): LookupCode {
  let current = error;
  for (let depth = 0; depth < 6; depth++) {
    const known = knownLookupCode(current);
    if (known) return known;
    if (current instanceof Error) {
      const message = current.name + " " + current.message;
      if (/human verification|captcha|access denied|unusual traffic/i.test(message))
        return "human_verification";
      if (/timeout|timed out|ERR_CONNECTION|ERR_NETWORK/i.test(message))
        return "timeout";
      if (
        /stale|Page changed|strict mode|lookup form changed|Execution context was destroyed/i.test(
          message,
        )
      )
        return "page_changed";
    }
    if (typeof current !== "object" || current === null || !("cause" in current)) break;
    current = current.cause;
  }
  return "unavailable";
}

export function lookupFailure(service: LookupService, code: LookupCode) {
  const message = {
    redirected:
      "MyVote redirected to the City’s election information page. An address-based voting-place lookup is unavailable there.",
    maintenance:
      "The City page reports maintenance. Its live schedule is unavailable right now.",
    timeout:
      "The City page did not respond in time. You can try the public lookup again or use another official source.",
    temporary:
      "The City service is temporarily unavailable. You can try the public lookup again or use another official source.",
    page_changed:
      "The City page changed while it was being read. Its controls need to be refreshed before another lookup.",
    human_verification:
      "The City requires human verification. Continue directly on the official site.",
    unavailable:
      "The City lookup could not be completed. You can use the official source or try another public lookup.",
  }[code];
  return {
    status: "lookup_unavailable" as const,
    service,
    code,
    message,
    // These are application-authored public reads, never a booking retry.
    retryPrompt:
      code === "human_verification" || code === "redirected"
        ? null
        : "Retry only the public information lookup using my previous preferences. Refresh the City page first. Do not prepare or submit any booking.",
    alternatives:
      service === "voting"
        ? [{ label: "City election information", url: CITY_ENTRY_POINTS.electionGuide }]
        : [
            { label: "City activity listings", url: CITY_ENTRY_POINTS.recreation },
            { label: "Canoe Landing schedules", url: CITY_ENTRY_POINTS.canoeLanding },
          ],
  };
}

// Rebuild copy and links from fixed application values rather than trusting output.
const failureSchema = z.object({
  status: z.literal("lookup_unavailable"),
  service: serviceSchema,
  code: codeSchema,
});
export function lookupFailureFromOutput(output: unknown) {
  const parsed = failureSchema.safeParse(output);
  return parsed.success ? lookupFailure(parsed.data.service, parsed.data.code) : null;
}
