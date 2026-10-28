import { knownLookupCode, lookupFailure } from "./lookup-recovery.ts";

const requestErrors = {
  context_limit:
    "This conversation is too large for another AI request. Start a new session after saving any receipt. Check Tasks before retrying a reservation.",
  budget_unavailable:
    "AI budget protection is temporarily unavailable. Please try again later. Check Tasks before retrying a reservation.",
  budget_exhausted:
    "The public AI allowance has been reached. Please come back later. Check Tasks before retrying a reservation.",
  unsupported_call:
    "This AI request is outside the supported model and content limits. Please try a shorter text request. Check Tasks before retrying a reservation.",
} as const;

export class AIRequestError extends Error {
  readonly code: keyof typeof requestErrors;
  constructor(code: keyof typeof requestErrors) {
    super(requestErrors[code]);
    this.name = "AIRequestError";
    this.code = code;
  }
}

export function aiFailureCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (current instanceof AIRequestError) return current.code;
    if (current instanceof Error && /abort|timeout/i.test(current.name))
      return "interrupted";
    if (typeof current !== "object" || current === null) break;
    if (
      "statusCode" in current &&
      typeof current.statusCode === "number" &&
      Number.isInteger(current.statusCode) &&
      current.statusCode >= 400 &&
      current.statusCode <= 599
    )
      return `upstream_${current.statusCode}`;
    if (!("cause" in current)) break;
    current = current.cause;
  }
  return "unknown";
}

export function publicAIError(error: unknown): string {
  const code = aiFailureCode(error);
  // The SDK can wrap tool exceptions. Classify their fixed public reason without
  // revealing the wrapper, raw page data, provider body or arbitrary cause text.
  let cause = error;
  for (let depth = 0; depth < 6; depth++) {
    const lookupCode = knownLookupCode(cause);
    if (lookupCode)
      return lookupFailure(
        lookupCode === "redirected" ? "voting" : "public",
        lookupCode,
      ).message;
    if (
      cause instanceof Error &&
      /Every result fact must be an exact excerpt|Observe a fresh official page|observation is stale|Page changed|strict mode violation|locator\.(click|fill)|Timeout.*exceeded/.test(
        cause.message,
      )
    ) {
      error = cause;
      break;
    }
    if (typeof cause !== "object" || cause === null || !("cause" in cause)) break;
    cause = cause.cause;
  }
  if (Object.hasOwn(requestErrors, code)) {
    // Narrow against the fixed allowlist; never return arbitrary error messages.
    for (const [key, message] of Object.entries(requestErrors))
      if (code === key) return message;
  }
  if (error instanceof Error) {
    if (
      /Every result fact must be an exact excerpt|Observe a fresh official page/i.test(
        error.message,
      )
    )
      return "A source excerpt could not be verified. Read the official page again and use its exact current wording. Nothing was booked.";
    if (/observation is stale|Page changed|strict mode violation/i.test(error.message))
      return "The official page controls changed. Read the page again before trying another lookup action. Nothing was booked.";
    if (/locator\.(click|fill)|Timeout.*exceeded/i.test(error.message))
      return "An official-page control was unavailable or timed out. Refresh its controls and try the public lookup again. Nothing was booked.";
  }
  if (
    error instanceof Error &&
    /free tier users do not have access|upgrade to paid credits/i.test(error.message)
  )
    return "This model requires purchased AI Gateway credits. Add credits to the Vercel team that issued this key, then retry. A Pro hosting upgrade is not required. No booking was submitted.";
  if (
    error instanceof Error &&
    /customer_verification_required|valid credit card|payment method/i.test(
      error.message,
    )
  )
    return "Vercel AI Gateway needs billing verification. Add a valid payment card to the Gateway team, then retry. No booking was submitted.";
  const status = code.startsWith("upstream_") ? Number(code.slice(9)) : undefined;
  if (status === 401 || status === 403)
    return "AI Gateway authentication failed. Check the server's Gateway key and account access, then retry.";
  if (status === 402)
    return "AI Gateway credits or budget are exhausted. Update the Gateway account, then retry.";
  if (status === 429) return "The model is rate limited. Wait briefly and retry.";
  if (status === 404)
    return "The configured model is unavailable to this Gateway account. Check AI_GATEWAY_MODEL.";
  if (
    code === "interrupted" ||
    (error instanceof Error && /abort|timeout/i.test(error.name + error.message))
  )
    return "The request stopped before it finished. Check Tasks before retrying a reservation.";
  return "The request could not finish. Check Tasks for booking progress before retrying.";
}
