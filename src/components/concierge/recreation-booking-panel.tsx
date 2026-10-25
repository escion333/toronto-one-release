"use client";
import Image from "next/image";
import { appPath } from "@/lib/app-path";
import { useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CityBrowser } from "./city-browser";
import type { useRecreationBooking } from "./use-recreation-booking";

export function RecreationBookingPanel({
  booking,
  accountOnly = false,
}: {
  booking: ReturnType<typeof useRecreationBooking>;
  accountOnly?: boolean;
}) {
  const { state, busy, error, action } = booking;
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const residentStep =
    state &&
    (!accountOnly || (state.status === "sign_in_required" && !state.activity)) &&
    ["sign_in_required", "resident_action_required", "needs_attention"].includes(
      state.status,
    );
  const review =
    !accountOnly && state?.status === "review_required" ? state.review : undefined;
  const expired = Boolean(review?.expired);
  return (
    <Card className="request-card booking-panel">
      <CardContent className="space-y-3">
        <div className="booking-summary">
          <div>
            <h2 className="card-heading">
              {accountOnly
                ? "City account"
                : state?.status === "confirmed"
                  ? "You’re booked"
                  : "Your reservation"}
            </h2>
            <p className="booking-state-message" role="status" aria-live="polite">
              {busy
                ? accountOnly
                  ? "Updating your City account…"
                  : "Working on your City booking…"
                : accountOnly && state?.activity
                  ? "Manage the City account connected to your reservation."
                  : (state?.message ?? "Sign in when you’re ready to reserve.")}
            </p>
          </div>
        </div>
        {!accountOnly && state?.status === "confirmed" && (
          <span className="booking-status">
            <ShieldCheck size={14} aria-hidden="true" /> Official receipt and City
            account matched
          </span>
        )}
        {!accountOnly && state?.activity && (
          <div className="inline-booking-details">
            <h3>{state.activity.name}</h3>
            <p className="whitespace-pre-line">{state.activity.dates}</p>
            <p>{state.activity.location}</p>
            <p className="card-footnote">{state.activity.feeNotice}</p>
          </div>
        )}
        {residentStep && !busy && (
          <CityBrowser key={`${state.status}:${state.activity?.number ?? "signin"}`} />
        )}
        {!accountOnly && state?.status === "participant_required" && (
          <div className="participant-options">
            <p>Who’s playing?</p>
            {state.participants?.map((participant) => (
              <Button
                key={participant.id}
                variant="outline"
                className="participant-option"
                disabled={busy}
                onClick={() =>
                  void action({ action: "participant", id: participant.id })
                }
              >
                {participant.label}
                <ChevronRight size={17} aria-hidden="true" />
              </Button>
            ))}
          </div>
        )}
        {review && (
          <section
            className="inline-approval"
            aria-label="Review and approve reservation"
          >
            <p>
              Participant: <strong>{review.participant}</strong>
            </p>
            <div className="approval-total">
              <span>Due now</span>
              <strong>
                $0.00 <small>CAD</small>
              </strong>
            </div>
            <details>
              <summary>City terms you accepted</summary>
              <p className="approval-terms">{review.terms}</p>
            </details>
            {expired && (
              <p role="status">
                This review expired. Recheck the City checkout before approving.
              </p>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={approvedId === review.id}
                disabled={busy || expired}
                onChange={(event) =>
                  setApprovedId(event.target.checked ? review.id : null)
                }
              />
              <span>
                I approve one real City reservation for this exact activity and
                participant. $0.00 due now.
              </span>
            </label>
            <Button
              className="w-full"
              disabled={busy || expired || approvedId !== review.id}
              onClick={() => {
                setApprovedId(null);
                void action({
                  action: "approve",
                  id: review.id,
                  digest: review.digest,
                  approved: true,
                });
              }}
            >
              Approve & reserve · $0.00
            </Button>
            {expired && (
              <Button
                variant="outline"
                onClick={() => {
                  setApprovedId(null);
                  void action({ action: "resume" });
                }}
              >
                Refresh checkout review
              </Button>
            )}
          </section>
        )}
        {!accountOnly && state?.receipt && (
          <div className="booking-receipt space-y-2 border-t pt-3">
            <p>Official receipt #{state.receipt.number}</p>
            {!state.receipt.accountVerified && <p>Account match not yet verified.</p>}
            <a
              className="official-link"
              href={state.receipt.evidenceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View official receipt
            </a>
            <details className="inline-receipt">
              <summary>Show official receipt</summary>
              <Image
                src={appPath("/api/recreation/receipt")}
                alt="Your official City of Toronto receipt"
                width={1000}
                height={1400}
                unoptimized
                className="official-receipt-preview"
              />
            </details>
            {!state.receipt.evidenceUrl.includes("format=pdf") && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void action({ action: "capture_receipt" })}
              >
                Get printable receipt
              </Button>
            )}
          </div>
        )}
        {!accountOnly && state?.status === "outcome_unknown" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void action({ action: "reconcile" })}
          >
            Check existing reservation
          </Button>
        )}
        {(!state || state.status === "disconnected") && (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => void action({ action: "connect" })}
          >
            Sign in to City account
          </Button>
        )}
        {residentStep && (
          <Button
            className="w-full"
            disabled={busy}
            onClick={() => {
              setApprovedId(null);
              void action({ action: "resume" });
            }}
          >
            {state.status === "sign_in_required"
              ? "I’m signed in · Continue"
              : state.status === "resident_action_required"
                ? "I’ve completed the City step"
                : "Resume booking"}
          </Button>
        )}
        <details className="booking-details booking-secondary">
          <summary>City account & details</summary>
          <p className="card-footnote">
            You control City sign-in and waivers. Credentials stay out of AI prompts.
            Disconnect clears this private browser session.
          </p>
          <div className="booking-controls">
            {state && state.status !== "disconnected" && (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action({ action: "resume" })}
                >
                  {accountOnly ? "Refresh account status" : "Refresh booking status"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action({ action: "disconnect" })}
                >
                  Disconnect City account
                </Button>
              </>
            )}
            {!accountOnly && state?.status === "confirmed" && (
              <Button
                variant="outline"
                disabled={busy || state.canReconcile === false}
                onClick={() => void action({ action: "reconcile" })}
              >
                Verify existing account record
              </Button>
            )}
          </div>
        </details>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
