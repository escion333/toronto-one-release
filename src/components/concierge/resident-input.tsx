"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResidentInput({
  address = false,
  question,
  choices,
  disabled,
  onSubmit,
}: {
  address?: boolean;
  question: string;
  choices?: string[];
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <p className="card-footnote" role="status">
        {address ? "Address supplied for this lookup." : "Your choice was sent."}
      </p>
    );
  return (
    <div className="inline-input-card">
      <p className="inline-input-title">
        {address && <MapPin size={18} aria-hidden="true" />}
        {question}
      </p>
      {address ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (consent && value.trim() && !disabled) {
              onSubmit(
                `Please use ${value.trim()} in Toronto MyVote to find my assigned voting place. I approve this address lookup.`,
              );
              setSent(true);
            }
          }}
        >
          <label className="sr-only" htmlFor="voting-street-address">
            Toronto street address
          </label>
          <Input
            id="voting-street-address"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="123 Example Street"
            autoComplete="street-address"
            maxLength={180}
            required
            disabled={disabled}
          />
          <p className="card-footnote">
            Street address only—no unit or voter ID. Your address goes to the AI
            provider and Toronto MyVote for this lookup.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>Use this address to find my voting place.</span>
          </label>
          <Button
            type="submit"
            className="w-full"
            disabled={disabled || !consent || !value.trim()}
          >
            Find my voting place
          </Button>
        </form>
      ) : (
        <div className="inline-choice-options">
          {choices?.map((choice) => (
            <Button
              variant="outline"
              key={choice}
              disabled={disabled}
              onClick={() => {
                onSubmit(choice);
                setSent(true);
              }}
            >
              {choice}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
