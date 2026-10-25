import { pruneMessages, type ModelMessage } from "ai";

const observationTools = [
  "browserOpen",
  "browserObserve",
  "browserAct",
  "recreationSearch",
  "searchTennisCourts",
  "recreationServiceGuide",
  "lookupVotingPlace",
];

/** Keep two recent observation exchanges in full. Older observations keep
 * navigation metadata so the model remembers which pages it already checked,
 * without resending large directory dumps. UI history and evidence stay intact.
 */
export function cityModelMessages(messages: ModelMessage[]): ModelMessage[] {
  const compact = messages.map((message, index): ModelMessage => {
    if (
      index >= messages.length - 4 ||
      message.role !== "tool" ||
      typeof message.content === "string"
    )
      return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (
          part.type !== "tool-result" ||
          !observationTools.includes(part.toolName) ||
          part.output.type !== "json" ||
          typeof part.output.value !== "object" ||
          part.output.value === null ||
          Array.isArray(part.output.value)
        )
          return part;
        const summary: Record<string, string | boolean> = {
          contentOmitted: true,
          note: "Earlier page content omitted. Re-open the page for current quotes and controls; do not repeat an unchanged search.",
        };
        for (const [key, value] of Object.entries(part.output.value))
          if (
            ["id", "url", "title", "checkedAt"].includes(key) &&
            typeof value === "string"
          )
            summary[key] = value;
        return { ...part, output: { type: "json" as const, value: summary } };
      }),
    };
  });
  return pruneMessages({
    messages: compact,
    reasoning: "before-last-message",
    emptyMessages: "remove",
  });
}
