# Service capabilities

The enabled service scope is City of Toronto municipal voting information and recreation. The chat can also answer questions about Toronto One's creator using a concise, locally maintained bio adapted from [Tom Sanee's portfolio](https://www.tomsanee.com/), without a City lookup. Other municipal services, other governments and other ACTIVE tenants are outside the implemented workflows. A link from a City page does not grant execution authority over an external service.

## Voting information

Official destination: [Toronto MyVote](https://myvote.toronto.ca/home).

The public browser can use address suggestions and read the assigned voting-place information. Result cards include observed official excerpts, source links and check times. The application does not establish voter eligibility, check a resident's voter-list identity, register a voter or provide mail-in ballot status.

Address input is used for the requested lookup. Results depend on the official site's current publication state; missing or unavailable information must be reported explicitly.

Residents can instead supply an intersection. A bounded server lookup matches the two street names against the City's Centreline Intersection Point layer, then selects the closest verified library, civic centre or community recreation centre address returned within 1.5 km. Distances are straight-line estimates. Ambiguous intersections, unavailable City data and missing matching MyVote suggestions require correction or the optional street-address flow; the model cannot invent a substitute address.

Intersection cards display the address used with a Nearby address label and a short assignment limitation. Expanding the address reveals the public facility, intersection, straight-line distance, City source records and a MyVote confirmation link. The assignment belongs to that public address; it does not establish the resident's assignment, even when nearby. Application code binds the lookup type and address to the observed MyVote result before publication.

Voting cards include an embedded Google Maps venue map and an external map link when the official result supplies a venue address. The map uses a keyless Google Maps iframe and sends only the public polling venue name and address to Google, excluding the lookup address and intersection. Map availability depends on Google and browser settings; the official address, entrance information and external link remain visible. Google Maps does not supply the election assignment or certify entrance accessibility.

## Recreation discovery

Official destination: [Toronto recreation activity search](https://anc.ca.apm.activecommunities.com/toronto/activity/search?viewMode=list), the City's Toronto ACTIVE tenant. The City also publishes [drop-in sports information](https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/sports/drop-in-sports-map/).

The agent can search public activities and inspect actual activity details. Cards use current observed descriptions and availability. Availability is a timestamped observation and can change before checkout. A listed activity, open form or successful HTTP response is not a reservation.

## Zero-dollar recreation reservation

The private adapter supports the reviewed enrollment/cart path with these conditions:

- Authentication and MFA occur directly in the legitimate City interface.
- The resident selects the participant and accepts legal waivers personally.
- The application validates a single matching activity and participant, accepted waiver and zero-dollar online total.
- A separate, expiring approval binds the exact checkout payload before submission.
- An outbound intent is recorded before Finish; duplicate and unknown outcomes cannot be blindly retried.
- Confirmed Tasks require the official receipt and matching City account enrollment evidence.
- The official printable receipt can be captured privately and delivered to its session owner.

Possible check-in fees remain distinct from the online total and must be disclosed. Nonzero checkout, additional declarations, unknown form requirements, CAPTCHA and other security challenges require attention; the adapter does not bypass them. Cancellation, paid checkout, account creation and other reservation types are not enabled.

## Reliability limits

These are browser integrations with changing external pages. Portal availability, session expiry, changing capacity, form changes and authentication requirements can interrupt execution. The interface must distinguish preparation, approval, attempted submission, unknown outcome and verified confirmation. It must never substitute a simulated receipt or stale availability for a failed official operation.

See [Architecture](ARCHITECTURE.md) for data and permission boundaries and [Validation](VALIDATION.md) for test coverage and remaining limits. These implementation notes do not establish a City-supported API or government endorsement.
