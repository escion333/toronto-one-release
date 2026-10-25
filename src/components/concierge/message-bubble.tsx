"use client";

import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Text stays React-escaped. Only emphasis and paragraph/list layout are interpreted. */
function emphasis(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={index}>{part}</Fragment>
      ),
    );
}
export function MessageBubble({
  text,
  resident,
  showActions = true,
}: {
  text: string;
  resident: boolean;
  showActions?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className={cn("message", resident ? "message-resident" : "message-assistant")}>
      <span className="sr-only">{resident ? "You" : "Toronto One"}: </span>
      <div className="message-body">
        {text.split(/\n\s*\n/).map((paragraph, index) => {
          const lines = paragraph.split("\n");
          if (lines.every((line) => /^\s*[-*]\s+/.test(line)))
            return (
              <ul key={index}>
                {lines.map((line, n) => (
                  <li key={n}>{emphasis(line.replace(/^\s*[-*]\s+/, ""))}</li>
                ))}
              </ul>
            );
          if (lines.every((line) => /^\s*\d+[.)]\s+/.test(line)))
            return (
              <ol key={index}>
                {lines.map((line, n) => (
                  <li key={n}>{emphasis(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>
                ))}
              </ol>
            );
          return <p key={index}>{emphasis(paragraph.replace(/^#{1,4}\s+/gm, ""))}</p>;
        })}
      </div>
      {!resident && showActions && (
        <div className="message-actions">
          <Button
            variant="ghost"
            size="icon"
            className="message-copy"
            aria-label={copied ? "Message copied" : "Copy message"}
            onClick={() => {
              void navigator.clipboard
                .writeText(text)
                .then(() => {
                  setCopied(true);
                  setCopyError(false);
                })
                .catch(() => setCopyError(true));
            }}
          >
            {copied ? (
              <Check size={15} aria-hidden="true" />
            ) : (
              <Copy size={15} aria-hidden="true" />
            )}
          </Button>
        </div>
      )}
      {copyError && (
        <span role="status" className="copy-note">
          Select and copy the text directly.
        </span>
      )}
    </div>
  );
}
