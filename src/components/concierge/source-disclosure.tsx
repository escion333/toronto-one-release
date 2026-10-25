import { ChevronDown, ExternalLink, Globe2 } from "lucide-react";
import type { CityUIMessage } from "@/lib/ai/agent";
import { messageSources, type SourceGroup } from "@/lib/ai/sources";

const checkTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const fullCheckTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Toronto",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

export function MessageSources({ message }: { message: CityUIMessage }) {
  const { kind, sources } = messageSources(message);
  return <SourceDisclosure kind={kind} sources={sources} />;
}

/** Native disclosure: collapsed initially, keyboard operable, no stored UI state. */
export function SourceDisclosure({
  sources,
  kind = "used",
}: {
  sources: SourceGroup[];
  kind?: "used" | "checked";
}) {
  if (!sources.length) return null;
  return (
    <details className="source-disclosure">
      <summary>
        <Globe2 size={15} aria-hidden="true" />
        <span>
          {kind === "used" ? "Sources" : "Pages checked"} · {sources.length}
        </span>
        <ChevronDown className="source-chevron" size={14} aria-hidden="true" />
      </summary>
      <div className="source-disclosure-body">
        <ul className="source-list">
          {sources.map((source) => {
            // Keep the preview and timestamp bound to the same observation.
            // Full citation evidence remains in the session/result metadata.
            const observation =
              source.observations.find((item) => item.excerpts.length) ??
              source.observations.at(-1);
            const excerpt = observation?.excerpts[0];
            const checked =
              observation?.checkedAt &&
              Number.isFinite(Date.parse(observation.checkedAt))
                ? new Date(observation.checkedAt)
                : undefined;
            return (
              <li key={source.url}>
                <div className="source-heading">
                  <a
                    className="source-title"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${source.title} — ${source.url}`}
                  >
                    <span>
                      {source.domain === "myvote.toronto.ca" ? "MyVote" : source.title}
                    </span>
                    <ExternalLink size={14} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  {checked && (
                    <span className="source-time">
                      <span aria-hidden="true">· </span>
                      <time
                        dateTime={observation?.checkedAt}
                        title={fullCheckTime.format(checked)}
                        aria-label={`Checked ${fullCheckTime.format(checked)}`}
                      >
                        {checkTime.format(checked)}
                      </time>
                    </span>
                  )}
                </div>
                {excerpt && (
                  <blockquote className="source-excerpt">
                    <span className="sr-only">{excerpt.label}: </span>
                    {excerpt.quote}
                  </blockquote>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
