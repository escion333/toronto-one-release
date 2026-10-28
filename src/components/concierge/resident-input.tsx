"use client";

import { useId, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ResidentInput({
  address = false,
  question,
  choices,
  inputType = "text",
  disabled,
  onSubmit,
}: {
  address?: boolean;
  question: string;
  choices?: string[];
  inputType?: "text" | "number" | "date";
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const locationId = useId();
  const [locationType, setLocationType] = useState<"intersection" | "address">(
    "intersection",
  );
  const [sent, setSent] = useState(false);
  if (sent)
    return (
      <p className="card-footnote" role="status">
        {address ? "Location supplied for this lookup." : "Your choice was sent."}
      </p>
    );
  return (
    <div className="inline-input-card">
      <p className="inline-input-title" id={`${locationId}-question`}>
        {address && <MapPin size={18} aria-hidden="true" />}
        {question}
      </p>
      {address ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim() && !disabled) {
              onSubmit(
                locationType === "intersection"
                  ? `Please use the Toronto intersection ${value.trim()} to choose a nearby public example address and look up its voting information in MyVote.`
                  : `Please look up voting information for the street address ${value.trim()} in Toronto MyVote.`,
              );
              setSent(true);
            }
          }}
        >
          <div
            className="voting-location-modes"
            role="group"
            aria-label="Location type"
          >
            {(["intersection", "address"] as const).map((mode) => (
              <Button
                key={mode}
                type="button"
                variant={locationType === mode ? "secondary" : "ghost"}
                aria-pressed={locationType === mode}
                disabled={disabled}
                onClick={() => {
                  setLocationType(mode);
                  setValue("");
                }}
              >
                {mode === "intersection" ? "Intersection" : "Street address"}
              </Button>
            ))}
          </div>
          <label className="sr-only" htmlFor={locationId}>
            {locationType === "intersection"
              ? "Toronto intersection"
              : "Toronto street address"}
          </label>
          <Input
            id={locationId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={
              locationType === "intersection"
                ? "Queen St & Bay St"
                : "123 Example Street"
            }
            autoComplete={locationType === "intersection" ? "off" : "street-address"}
            maxLength={180}
            required
            disabled={disabled}
          />
          {locationType === "intersection" && (
            <p className="card-footnote">
              We’ll check a nearby public example address. Your assigned voting place
              may differ.
            </p>
          )}
          <Button type="submit" className="w-full" disabled={disabled || !value.trim()}>
            {locationType === "intersection"
              ? "Find example voting information"
              : "Find voting place"}
          </Button>
        </form>
      ) : (
        <form
          aria-labelledby={`${locationId}-question`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled && value.trim()) {
              onSubmit(value.trim());
              setSent(true);
            }
          }}
        >
          <div className="inline-choice-options">
            {choices?.map((choice) => (
              <Button
                type="button"
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
          <label className="sr-only" htmlFor={locationId}>
            {question}
          </label>
          <Input
            id={locationId}
            type={inputType}
            inputMode={inputType === "number" ? "numeric" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={choices?.length ? "Or enter your own answer" : "Your answer"}
            autoComplete="off"
            maxLength={400}
            min={inputType === "number" ? 0 : undefined}
            step={inputType === "number" ? 1 : undefined}
            required
            disabled={disabled}
          />
          <Button type="submit" disabled={disabled || !value.trim()}>
            Continue
          </Button>
        </form>
      )}
    </div>
  );
}
