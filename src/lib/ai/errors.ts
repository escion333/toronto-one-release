export function publicAIError(error: unknown): string {
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
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? error.statusCode
      : undefined;
  if (status === 401 || status === 403)
    return "AI Gateway authentication failed. Check the server's Gateway key and account access, then retry.";
  if (status === 402)
    return "AI Gateway credits or budget are exhausted. Update the Gateway account, then retry.";
  if (status === 429) return "The model is rate limited. Wait briefly and retry.";
  if (status === 404)
    return "The configured model is unavailable to this Gateway account. Check AI_GATEWAY_MODEL.";
  if (error instanceof Error && /abort|timeout/i.test(error.name + error.message))
    return "The request stopped before it finished. You can retry; no booking was submitted.";
  return "The AI connection could not finish. Check Gateway access or connectivity and retry. No booking was submitted.";
}
