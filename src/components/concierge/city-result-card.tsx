"use client";
import type { CityResult } from "@/lib/ai/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { groupSources, resultSources } from "@/lib/ai/sources";
import { SourceDisclosure } from "./source-disclosure";
import { VotingLocationMap } from "./voting-location-map";
import { ChevronDown } from "lucide-react";

export function CityResultCard({
  result,
  onPrepare,
  showSources = true,
}: {
  result: CityResult;
  onPrepare?: (id: string) => void;
  showSources?: boolean;
}) {
  const voting = result.kind === "voting";
  const lookup = voting ? result.voting?.lookup : undefined;
  const venue = voting ? result.voting?.venue : undefined;
  const addressKey = (value: string) =>
    value
      .toLowerCase()
      .replace(/,?\s*toronto\s*$/i, "")
      .trim();
  // Keep cost, eligibility and availability visible alongside the first facts.
  // Full evidence remains in citation metadata; the source disclosure is a preview.
  const summaryFacts = result.facts.filter(
    (fact, index) =>
      index < 3 ||
      /fee|cost|price|availab|eligib|age|accessib|date|time|hours?|entrance|when|place|location|address|where/i.test(
        fact.label,
      ) ||
      /\$|\bfees?\b|\bcharges?\b/i.test(fact.quote),
  );
  const displayedFacts = voting
    ? summaryFacts.filter(
        (fact) =>
          fact.quote.trim() !== venue?.name &&
          addressKey(fact.quote) !== addressKey(venue?.address ?? "") &&
          addressKey(fact.quote) !== addressKey(lookup?.address ?? ""),
      )
    : summaryFacts;
  return (
    <Card className="request-card city-result-card">
      <CardContent>
        <h2 className="card-heading">{voting ? "Voting information" : result.title}</h2>
        {lookup?.type === "intersection" && (
          <div className="voting-example-context">
            <details className="voting-example-details">
              <summary>
                <span className="voting-lookup-label">Nearby address</span>
                <span>{lookup.address}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div className="voting-example-evidence">
                <p>{lookup.publicPlace}</p>
                <p>
                  Near {lookup.intersection} · about {lookup.distanceMetres} m in a
                  straight line.
                </p>
                <a href={lookup.intersectionSourceUrl} target="_blank" rel="noreferrer">
                  City intersection record
                </a>
                <a href={lookup.publicPlaceSourceUrl} target="_blank" rel="noreferrer">
                  City public-place record
                </a>
                <a
                  href="https://myvote.toronto.ca/home"
                  target="_blank"
                  rel="noreferrer"
                >
                  Check your address in MyVote
                </a>
              </div>
            </details>
            <p className="voting-example-caveat">
              Your assigned voting place may differ.
            </p>
          </div>
        )}
        {venue && (
          <div className="voting-venue">
            <h3>{venue.name}</h3>
            <p>{venue.address}</p>
          </div>
        )}
        <dl className={`result-facts${voting ? " voting-facts" : ""}`}>
          {displayedFacts.map((fact, index) => (
            <div key={index}>
              <dt className={voting ? undefined : "sr-only"}>{fact.label}</dt>
              <dd className="source-quote">
                {voting
                  ? fact.quote.replace(/^(?:Preferred|Accessible) Entrance:\s*/i, "")
                  : fact.quote}
              </dd>
            </div>
          ))}
        </dl>
        {voting && result.voting?.venue && (
          <VotingLocationMap venue={result.voting.venue} />
        )}
        {["recreation", "facility"].includes(result.kind) && onPrepare && (
          <div className="result-next">
            <Button className="w-full" onClick={() => onPrepare(result.id)}>
              {result.kind === "facility"
                ? "Choose court date & time"
                : "Prepare reservation"}
            </Button>
            <p className="result-availability-note">
              Not reserved yet.
              {!result.facts.some((fact) =>
                /fee|charge|cost|price/i.test(fact.label + " " + fact.quote),
              ) && " Check-in fees may apply."}
            </p>
          </div>
        )}
        {showSources && (
          <SourceDisclosure sources={groupSources(resultSources(result))} />
        )}
      </CardContent>
    </Card>
  );
}
