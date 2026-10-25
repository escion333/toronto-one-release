export const CITY_ENTRY_POINTS = {
  voting: "https://myvote.toronto.ca/home",
  recreation:
    "https://anc.ca.apm.activecommunities.com/toronto/activity/search?viewMode=list",
  electionGuide: "https://www.toronto.ca/city-government/elections/",
  recreationGuide:
    "https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/sports/drop-in-sports-map/",
} as const;

export function approvedPageUrl(value: string): string {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new Error("Use a reviewed HTTPS City service.");
  const allowed =
    (u.hostname === "myvote.toronto.ca" &&
      /^\/(home|hub|votingplace|candidateslist|ballotsample)\/?$/i.test(u.pathname)) ||
    (u.hostname === "www.toronto.ca" &&
      (u.pathname.startsWith("/city-government/elections/") ||
        u.pathname.startsWith("/explore-enjoy/parks-recreation/"))) ||
    (u.hostname === "anc.ca.apm.activecommunities.com" &&
      /^\/toronto\/activity\/search(?:\/detail\/\d+)?\/?$/.test(u.pathname));
  if (!allowed)
    throw new Error(
      "That page is outside the reviewed Toronto election/recreation scope.",
    );
  u.hash = "";
  return u.href;
}

// The official listing uses legacy links for the same City tenant's public details.
export function normalizeCityLink(value: string, base: string): string | null {
  try {
    const u = new URL(value, base);
    if (u.hostname === "ca.apm.activecommunities.com") {
      const match = /^\/toronto\/Activity_Search\/[^/]+\/(\d+)$/i.exec(u.pathname);
      if (match?.[1])
        return approvedPageUrl(
          `https://anc.ca.apm.activecommunities.com/toronto/activity/search/detail/${match[1]}`,
        );
    }
    return approvedPageUrl(u.href);
  } catch {
    return null;
  }
}

export type BrowserControl = {
  ref: string;
  tag: string;
  role: string;
  name: string;
  field: string;
  href: string | null;
  type: string;
  context?: string;
};
export type BrowserAction = "click" | "fill" | "select";
export function allowedActions(url: string, control: BrowserControl): BrowserAction[] {
  const u = new URL(approvedPageUrl(url));
  if (control.href && control.tag === "a") {
    try {
      approvedPageUrl(control.href);
      return ["click"];
    } catch {
      return [];
    }
  }
  if (u.hostname === "myvote.toronto.ca") {
    if (
      control.field === "Address" &&
      control.tag === "input" &&
      ["", "text", "search"].includes(control.type)
    )
      return ["fill"];
    if (control.role === "option") return ["click"];
    if (
      control.tag === "button" &&
      /^(Go|Clear|Election Day|Advance Vote)$/i.test(control.name)
    )
      return ["click"];
    return [];
  }
  if (u.hostname === "anc.ca.apm.activecommunities.com") {
    if (
      control.field === "activity-cascaded-search-input" &&
      control.tag === "input" &&
      ["", "text", "search"].includes(control.type)
    )
      return ["fill"];
    if (
      control.tag === "button" &&
      /^(Search|Open spots|Activities|Next|Previous|\d+)$/i.test(control.name)
    )
      return ["click"];
  }
  return [];
}
export const normalizeEvidence = (value: string) => value.replace(/\s+/g, " ").trim();

/** Only equivalent spelling/abbreviation changes; partial addresses never authorize a choice. */
export function addressSuggestionAllowed(
  requested: string | undefined,
  selected: string,
  suggestions: string[],
) {
  if (suggestions.length === 1) return true;
  if (!requested) return false;
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/[.,]/g, " ")
      .replace(
        /\b(?:STREET|AVENUE|ROAD|BOULEVARD|DRIVE|WEST|EAST|NORTH|SOUTH)\b/g,
        (part) =>
          ({
            STREET: "ST",
            AVENUE: "AVE",
            ROAD: "RD",
            BOULEVARD: "BLVD",
            DRIVE: "DR",
            WEST: "W",
            EAST: "E",
            NORTH: "N",
            SOUTH: "S",
          })[part] ?? part,
      )
      .replace(/\s+/g, " ")
      .trim();
  const exact = suggestions.filter((name) => normalize(name) === normalize(requested));
  return exact.length === 1 && normalize(selected) === normalize(requested);
}
export function verifyQuotes(text: string, quotes: string[]): void {
  const normalized = normalizeEvidence(text);
  if (
    !quotes.length ||
    quotes.some(
      (q) => q.trim().length < 3 || !normalized.includes(normalizeEvidence(q)),
    )
  ) {
    throw new Error(
      "Every result fact must be an exact excerpt from the observed official page. Observe again rather than inventing a fact.",
    );
  }
}
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (process.env.PUBLIC_ORIGIN && origin !== null)
    return origin === process.env.PUBLIC_ORIGIN;
  if (origin === null) return request.headers.get("sec-fetch-site") !== "cross-site";
  const target = new URL(request.url);
  // Next normalizes loopback request.url to localhost while Host preserves 127.0.0.1.
  const host = request.headers.get("host");
  return (
    origin === target.origin ||
    (host !== null && origin === `${target.protocol}//${host}`)
  );
}
