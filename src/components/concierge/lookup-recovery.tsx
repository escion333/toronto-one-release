"use client";

import { Button } from "@/components/ui/button";
import type { lookupFailure } from "@/lib/ai/lookup-recovery";

export function LookupRecovery({
  failure,
  disabled,
  onRetry,
}: {
  failure: ReturnType<typeof lookupFailure>;
  disabled: boolean;
  onRetry: (prompt: string) => void;
}) {
  return (
    <div className="inline-input-card" role="status">
      <p className="inline-input-title">City lookup unavailable</p>
      <p>{failure.message}</p>
      <div className="inline-choice-options">
        {failure.retryPrompt && (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => failure.retryPrompt && onRetry(failure.retryPrompt)}
          >
            Try public lookup again
          </Button>
        )}
        {failure.alternatives.map((link) => (
          <Button key={link.url} variant="outline" asChild>
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {link.label}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}
