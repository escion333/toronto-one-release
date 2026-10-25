"use client";
import { useRef, useState } from "react";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { BottomSheet } from "./bottom-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { useRecreationBooking } from "./use-recreation-booking";

export function RecreationBookingPanel({
  booking,
}: {
  booking: ReturnType<typeof useRecreationBooking>;
}) {
  const { state, busy, error, action } = booking;
  const reviewButton = useRef<HTMLButtonElement>(null);
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [dismissedSheet, setDismissedSheet] = useState<string | null>(null);
  const choosing = state?.status === "participant_required";
  const reviewing = state?.status === "review_required" && Boolean(state.review);
  const sheetKey = state?.review?.id ?? `${state?.status}:${state?.activity?.number}`;
  const sheetOpen = (choosing || reviewing) && dismissedSheet !== sheetKey;
  const approvalControls =
    state?.status === "review_required" && state.review ? (
      <div className="approval-actions">
        <label className="check-label">
          <input
            type="checkbox"
            checked={approvedId === state.review.id}
            onChange={(e) =>
              setApprovedId(e.target.checked ? (state.review?.id ?? null) : null)
            }
          />
          <span>
            I approve one real City reservation for this activity and participant. $0.00
            due now.
          </span>
        </label>
        <Button
          className="w-full"
          disabled={approvedId !== state.review.id || busy}
          onClick={() => {
            if (state.review)
              void action({
                action: "approve",
                id: state.review.id,
                digest: state.review.digest,
                approved: true,
              });
            setApprovedId(null);
          }}
        >
          Approve & reserve · $0.00
        </Button>
      </div>
    ) : null;
  return (
    <Card className="request-card booking-panel">
      <CardContent className="space-y-3">
        <div className="booking-summary">
          <div>
            <h2 className="card-heading">
              {state?.activity?.name ?? "Recreation booking"}
            </h2>
            <p className="booking-state-message" role="status" aria-live="polite">
              {state?.message ?? "Sign in to reserve with your City account."}
            </p>
          </div>
        </div>
        {state?.status === "confirmed" && (
          <span className="booking-status">
            <ShieldCheck size={13} aria-hidden="true" />
            City account verified
          </span>
        )}
        {state?.activity && (
          <dl className="detail-fields">
            <div>
              <dt>When</dt>
              <dd className="whitespace-pre-line">{state.activity.dates}</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>{state.activity.location}</dd>
            </div>
            <div>
              <dt>Fees</dt>
              <dd>{state.activity.feeNotice}</dd>
            </div>
          </dl>
        )}
        {(choosing || reviewing) && (
          <Button
            ref={reviewButton}
            className="w-full"
            disabled={busy}
            onClick={() => setDismissedSheet(null)}
          >
            {choosing ? "Choose a participant" : "Review reservation"}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        )}
        <BottomSheet
          open={sheetOpen}
          onOpenChange={(open) => {
            setDismissedSheet(open ? null : sheetKey);
            if (!open) setApprovedId(null);
          }}
          footer={approvalControls}
          returnFocusRef={reviewButton}
          className="booking-review-sheet"
          title={choosing ? "Choose participant" : "Review reservation"}
          description={choosing ? "From your City account." : "Confirm your selection."}
        >
          {state?.activity && (
            <div className="approval-activity">
              <h3>{state.activity.name}</h3>
              <p className="approval-reference">Activity #{state.activity.number}</p>
              <p>{state.activity.dates}</p>
              <p>{state.activity.location}</p>
              <p className="approval-fees">{state.activity.feeNotice}</p>
            </div>
          )}
          {state?.status === "participant_required" && (
            <div className="participant-options">
              {state.participants?.map((participant) => (
                <Button
                  key={participant.id}
                  className="participant-option"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void action({ action: "participant", id: participant.id })
                  }
                >
                  {participant.label} <ChevronRight size={17} aria-hidden="true" />
                </Button>
              ))}
            </div>
          )}
          {state?.status === "review_required" && state.review && (
            <div className="space-y-3 border-t pt-3">
              <p>
                Participant: <strong>{state.review.participant}</strong>
              </p>
              <div className="approval-total">
                <span>Due now</span>
                <strong>
                  $0.00 <small>CAD</small>
                </strong>
              </div>
              <p className="approval-terms">{state.review.terms}</p>
            </div>
          )}
        </BottomSheet>
        {state?.receipt && (
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
        {state?.status === "outcome_unknown" && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void action({ action: "reconcile" })}
          >
            Reconcile existing reservation
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
        {state &&
          ["sign_in_required", "resident_action_required", "needs_attention"].includes(
            state.status,
          ) && (
            <Button
              className="w-full"
              disabled={busy}
              onClick={() => void action({ action: "resume" })}
            >
              {state.status === "resident_action_required"
                ? "I’ve completed the City step"
                : state.status === "sign_in_required"
                  ? "I’m signed in"
                  : "Check booking status"}
            </Button>
          )}
        <details className="booking-details booking-secondary">
          <summary>City account & details</summary>
          {state?.activity && (
            <p className="card-footnote">Activity #{state.activity.number}</p>
          )}
          <p className="card-footnote">
            Sign in in the City browser. Passwords and account pages stay out of AI
            prompts. Disconnecting clears the temporary City session.
          </p>
          <div className="booking-controls">
            {state && state.status !== "disconnected" && (
              <>
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => void action({ action: "connect" })}
                >
                  Show City browser
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action({ action: "resume" })}
                >
                  Refresh booking status
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action({ action: "disconnect" })}
                >
                  Disconnect
                </Button>
              </>
            )}
            {state?.status === "confirmed" && (
              <Button
                variant="outline"
                disabled={busy || state.canReconcile === false}
                title={
                  state.canReconcile === false
                    ? "Live rechecking requires the original approved City browser session."
                    : undefined
                }
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
        {state && state.timings.length > 0 && (
          <details className="booking-details booking-detail-copy">
            <summary className="min-h-11 cursor-pointer py-3">
              Execution timings
            </summary>
            {state.executionMs !== undefined && (
              <p>
                Checkout and account verification:{" "}
                {(state.executionMs / 1000).toFixed(2)} seconds.
              </p>
            )}
            {state.operations?.map((operation, index) => (
              <p key={index}>
                {operation.action.replaceAll("_", " ")}:{" "}
                {(operation.elapsedMs / 1000).toFixed(2)}s ·{" "}
                {operation.ok ? "completed" : "needs attention"}
              </p>
            ))}
            <p>Session phase totals (including read-only rechecks):</p>
            <ul>
              {Object.entries(
                state.timings.reduce<Record<string, number>>((total, span) => {
                  total[span.phase] = (total[span.phase] ?? 0) + span.ms;
                  return total;
                }, {}),
              ).map(([phase, ms]) => (
                <li key={phase}>
                  {phase.replaceAll("_", " ")}: {(ms / 1000).toFixed(2)}s
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
