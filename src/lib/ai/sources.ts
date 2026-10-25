import type { CityUIMessage } from "./agent.ts";
import type { CityResult, SourceCitation } from "./contracts.ts";
import { approvedPageUrl, normalizeEvidence } from "./policy.ts";

export type SourceEvidence = {
  observationId: string;
  url: string;
  title: string;
  checkedAt?: string;
  excerpts: SourceCitation["excerpts"];
};
export type SourceGroup = {
  url: string;
  title: string;
  domain: string;
  observations: SourceEvidence[];
};

/** Keep query filters distinct, but ignore fragments, query order and trailing slashes. */
function sourceKey(url: string) {
  const key = new URL(url);
  key.pathname = key.pathname.replace(/\/$/, "") || "/";
  key.searchParams.sort();
  return key.href;
}

export function groupSources(sources: SourceEvidence[]): SourceGroup[] {
  const grouped = new Map<string, SourceGroup>();
  for (const source of sources) {
    let url: string;
    try {
      url = approvedPageUrl(source.url);
    } catch {
      continue;
    }
    const domain = new URL(url).hostname;
    const title = source.title.trim() || domain;
    const key = sourceKey(url);
    let group = grouped.get(key);
    if (!group) {
      group = { url, title, domain, observations: [] };
      grouped.set(key, group);
    }
    const existing = group.observations.find(
      (item) => item.observationId === source.observationId,
    );
    if (existing) {
      for (const excerpt of source.excerpts)
        if (
          !existing.excerpts.some(
            (item) =>
              normalizeEvidence(item.quote) === normalizeEvidence(excerpt.quote),
          )
        )
          existing.excerpts.push({ ...excerpt });
    } else {
      group.observations.push({
        ...source,
        url,
        excerpts: source.excerpts.map((excerpt) => ({ ...excerpt })),
      });
    }
  }
  return [...grouped.values()];
}

export function resultSources(result: CityResult): SourceEvidence[] {
  if (result.sources?.length) return result.sources;
  // Older in-memory results predate citation metadata. Never attribute a linked
  // listing's quote to the detail page or invent its missing observation time.
  return result.facts.map((fact) => {
    const url = fact.sourceUrl ?? result.sourceUrl;
    return {
      observationId: `${result.id}:${url}`,
      url,
      title: "",
      ...(url === result.sourceUrl ? { checkedAt: result.checkedAt } : {}),
      excerpts: [{ label: fact.label, quote: fact.quote }],
    };
  });
}

export function messageSources(message: CityUIMessage): {
  kind: "used" | "checked";
  sources: SourceGroup[];
} {
  const cited: SourceEvidence[] = [];
  const checked: SourceEvidence[] = [];
  for (const part of message.parts) {
    if (part.type === "tool-citeSource" && part.state === "output-available")
      cited.push(part.output);
    if (part.type === "tool-publishResult" && part.state === "output-available")
      cited.push(...resultSources(part.output));
    if (
      (part.type === "tool-browserOpen" ||
        part.type === "tool-browserObserve" ||
        part.type === "tool-browserAct" ||
        part.type === "tool-lookupVotingPlace" ||
        part.type === "tool-recreationSearch") &&
      part.state === "output-available"
    ) {
      const observed = part.output;
      checked.push({
        observationId: observed.id,
        url: observed.url,
        title: observed.title,
        checkedAt: observed.checkedAt,
        excerpts: [],
      });
    }
  }
  if (cited.length) return { kind: "used", sources: groupSources(cited) };
  // Repeated browser steps are not additional sources. Without a selected quote,
  // show only the latest visit to each page, explicitly as a page checked.
  return {
    kind: "checked",
    sources: groupSources(checked).map((source) => ({
      ...source,
      observations: source.observations.slice(-1),
    })),
  };
}
