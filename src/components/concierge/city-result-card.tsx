"use client";
import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CityResult } from "@/lib/ai/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function CityResultCard({
  result,
  onPrepare,
}: {
  result: CityResult;
  onPrepare?: (id: string) => void;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const voting = result.kind === "voting";
  const checkedAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(result.checkedAt));
  // Keep cost, eligibility and availability visible alongside the first facts.
  // The source sheet retains every exact excerpt, without shortening its values.
  const summaryFacts = result.facts.filter(
    (fact, index) =>
      index < 3 ||
      /fee|cost|price|availab|eligib|age|accessib|date|time|hours?|entrance|when|place|location|address|where/i.test(
        fact.label,
      ) ||
      /\$|\bfees?\b|\bcharges?\b/i.test(fact.quote),
  );
  return (
    <Card className="request-card city-result-card">
      <CardContent>
        <h2 className="card-heading">{result.title}</h2>
        <dl className="result-facts">
          {summaryFacts.map((fact, index) => (
            <div key={index}>
              <dt className="sr-only">{fact.label}</dt>
              <dd className="source-quote">{fact.quote}</dd>
            </div>
          ))}
        </dl>
        {result.kind === "recreation" && onPrepare && (
          <div className="result-next">
            <Button className="w-full" onClick={() => onPrepare(result.id)}>
              Prepare reservation
            </Button>
            <p className="result-availability-note">
              Not reserved yet.
              {!result.facts.some((fact) =>
                /fee|charge|cost|price/i.test(fact.label + " " + fact.quote),
              ) && " Check-in fees may apply."}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          className="result-source-trigger"
          onClick={() => setSourceOpen(true)}
        >
          Sources · Checked {checkedAt}
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
        {sourceOpen && (
          <section className="inline-sources" aria-label="Official sources">
            <a
              className="official-link"
              href={result.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {voting ? "Toronto MyVote" : "City activity page"}
              <ExternalLink size={15} aria-hidden="true" />
            </a>
            <dl className="result-facts source-facts">
              {result.facts.map((fact, index) => (
                <div key={index}>
                  <dt>{fact.label}</dt>
                  <dd className="source-quote">{fact.quote}</dd>
                  {fact.sourceUrl && fact.sourceUrl !== result.sourceUrl && (
                    <dd>
                      <a
                        className="official-link"
                        href={fact.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        City activity listing
                        <ExternalLink size={14} aria-hidden="true" />
                      </a>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            <p className="sheet-note">
              Exact official-page excerpts.{" "}
              {voting
                ? "Eligibility and voter registration were not checked."
                : "Availability can change; this result does not hold a spot."}
            </p>
            <p className="sheet-note">Toronto One is independent from the City.</p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
