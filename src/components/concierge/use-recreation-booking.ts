"use client";
import { appPath } from "@/lib/app-path";
import { useEffect, useState } from "react";
import { bookingStateSchema, type BookingState } from "@/lib/ai/booking-contracts";

export function useRecreationBooking() {
  const [state, setState] = useState<BookingState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const read = () =>
      fetch(appPath("/api/recreation"), { signal: controller.signal })
        .then((r) =>
          r.ok ? r.json() : Promise.reject(new Error("Booking state unavailable")),
        )
        .then((value: unknown) => setState(bookingStateSchema.parse(value)))
        .catch(() => undefined);
    void read();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, 1500);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function action(input: Record<string, string | boolean | number>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(appPath("/api/recreation"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) throw new Error(await response.text());
      setState(bookingStateSchema.parse(await response.json()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The City browser is unavailable.");
    } finally {
      setBusy(false);
    }
  }
  return { state, busy, error, action };
}
