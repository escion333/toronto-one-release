import type { Observation } from "./browser.ts";
import { sourceCitationSchema, type SourceCitation } from "./contracts.ts";
import { approvedPageUrl, verifyQuotes } from "./policy.ts";

/** Only the executor can supply a citation's URL, page title and check time. */
export function citeObservation(
  observed: Observation | undefined,
  excerpts: SourceCitation["excerpts"],
  now = Date.now(),
): SourceCitation {
  const checkedAt = observed ? Date.parse(observed.checkedAt) : NaN;
  if (!observed || !Number.isFinite(checkedAt) || now - checkedAt > 5 * 60_000)
    throw new Error("Observe a fresh official page before citing it.");
  verifyQuotes(
    observed.text,
    excerpts.map((excerpt) => excerpt.quote),
  );
  return sourceCitationSchema.parse({
    observationId: observed.id,
    url: approvedPageUrl(observed.url),
    title: observed.title.replace(/\s+/g, " ").trim().slice(0, 240),
    checkedAt: observed.checkedAt,
    excerpts,
  });
}
