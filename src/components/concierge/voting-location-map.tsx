import { ExternalLink } from "lucide-react";
import { votingMapLinks } from "@/lib/voting-map";

export function VotingLocationMap({
  venue,
}: {
  venue: { name: string; address: string };
}) {
  const links = votingMapLinks(venue.address, venue.name);
  return (
    <section className="voting-map" aria-label="Voting place map">
      <iframe
        title={`Google Maps: ${venue.name}, ${venue.address}`}
        src={links.embed}
        width="100%"
        height="280"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <a
        className="official-link"
        href={links.external}
        target="_blank"
        rel="noreferrer"
      >
        Open in Google Maps <ExternalLink size={15} aria-hidden="true" />
      </a>
    </section>
  );
}
