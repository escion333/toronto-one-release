"use client";

import { isToolUIPart, getToolName } from "ai";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleDashed,
  LoaderCircle,
} from "lucide-react";
import type { CityUIMessage } from "@/lib/ai/agent";

const labels: Record<string, string> = {
  browserOpen: "Open City service",
  browserObserve: "Read page",
  browserAct: "Navigate service",
  requestResidentInput: "Ask for a detail",
  publishResult: "Check excerpts",
  citeSource: "Check source excerpts",
  recreationBookingStatus: "Read booking status",
  recreationSearch: "Find recreation sessions",
  lookupVotingPlace: "Find voting information",
  prepareRecreationBooking: "Prepare reservation",
};
export function AgentActivity({
  message,
  active,
}: {
  message: CityUIMessage;
  active: boolean;
}) {
  const parts = message.parts
    .filter(isToolUIPart)
    .filter(
      (part) =>
        part.type !== "tool-requestResidentInput" &&
        part.type !== "tool-requestStreetAddress",
    );
  if (!parts.length) return null;
  const browserTools = new Set([
    "browserOpen",
    "browserObserve",
    "browserAct",
    "recreationSearch",
    "lookupVotingPlace",
    "publishResult",
    "citeSource",
  ]);
  const visibleParts = parts.filter(
    (part) => !browserTools.has(getToolName(part)) || part.state !== "output-available",
  );
  if (!active && !visibleParts.length) return null;
  const pending =
    active &&
    parts.some(
      (part) => part.state !== "output-available" && part.state !== "output-error",
    );
  const failed = parts.some((part) => part.state === "output-error");
  const incomplete = parts.some(
    (part) => part.state !== "output-available" && part.state !== "output-error",
  );
  const sourceOnly = parts.every((part) => browserTools.has(getToolName(part)));
  return (
    <details className="agent-activity" data-running={active}>
      <summary>
        {active ? (
          <LoaderCircle className="activity-spinner" size={15} aria-hidden="true" />
        ) : failed ? (
          <CircleAlert size={15} aria-hidden="true" />
        ) : incomplete ? (
          <CircleDashed size={15} aria-hidden="true" />
        ) : (
          <Check size={15} aria-hidden="true" />
        )}
        <span>
          {active
            ? pending
              ? sourceOnly
                ? "Checking City sources…"
                : "Working…"
              : "Thinking…"
            : failed
              ? "A step needs attention"
              : incomplete
                ? "Check incomplete"
                : "Activity"}
        </span>
        <ChevronDown className="activity-chevron" size={14} aria-hidden="true" />
      </summary>
      <ol>
        {visibleParts.map((part) => (
          <li key={part.toolCallId} data-failed={part.state === "output-error"}>
            {part.state === "output-available" ? (
              <Check size={14} aria-hidden="true" />
            ) : part.state === "output-error" ? (
              <CircleAlert size={14} aria-hidden="true" />
            ) : active ? (
              <LoaderCircle className="activity-spinner" size={14} aria-hidden="true" />
            ) : (
              <CircleDashed size={14} aria-label="Not completed" />
            )}
            <span>
              {labels[getToolName(part)] ?? "Agent step"}
              {part.state === "output-error" && <small>{part.errorText}</small>}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
