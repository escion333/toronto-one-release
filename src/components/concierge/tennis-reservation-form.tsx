"use client";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { torontoDate } from "@/lib/ai/tennis-contracts";
import type { useRecreationBooking } from "./use-recreation-booking";

export function TennisReservationForm({
  booking,
}: {
  booking: ReturnType<typeof useRecreationBooking>;
}) {
  const id = useId();
  const today = torontoDate();
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + 7);
  const inputClass =
    "min-h-11 w-full rounded-xl border border-input bg-background px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const maximum = String(values.get("maximum") ?? "0");
        if (!/^\d+(?:\.\d{1,2})?$/.test(maximum)) return;
        void booking.action({
          action: "tennis_details",
          date: String(values.get("date")),
          startTime: String(values.get("time")),
          durationMinutes: 60,
          attendees: Number(values.get("attendees")),
          maxTotalCents: Math.round(Number(maximum) * 100),
        });
      }}
    >
      <label className="block space-y-1" htmlFor={`${id}-date`}>
        <span>Date</span>
        <input
          id={`${id}-date`}
          name="date"
          type="date"
          min={today}
          max={lastDay.toISOString().slice(0, 10)}
          required
          className={inputClass}
        />
      </label>
      <label className="block space-y-1" htmlFor={`${id}-time`}>
        <span>Start time · Toronto</span>
        <input
          id={`${id}-time`}
          name="time"
          type="time"
          min="08:00"
          max="21:00"
          step="3600"
          required
          className={inputClass}
        />
      </label>
      <p className="card-footnote">
        One-hour match-play reservation. The City’s schedule determines availability.
      </p>
      <label className="block space-y-1" htmlFor={`${id}-attendees`}>
        <span>People playing</span>
        <input
          id={`${id}-attendees`}
          name="attendees"
          type="number"
          min="1"
          max="9"
          required
          className={inputClass}
        />
      </label>
      <label className="block space-y-1" htmlFor={`${id}-maximum`}>
        <span>Maximum total · CAD</span>
        <input
          id={`${id}-maximum`}
          name="maximum"
          type="number"
          min="0"
          max="1000"
          step="0.01"
          defaultValue="0.00"
          required
          className={inputClass}
        />
      </label>
      <p className="card-footnote">
        Keep $0.00 to allow free bookings only. The City may charge rental, insurance or
        other fees; a higher total stops the payment handoff. Nothing is reserved by
        this form.
      </p>
      <Button className="w-full" type="submit" disabled={booking.busy}>
        Check with City account
      </Button>
    </form>
  );
}
