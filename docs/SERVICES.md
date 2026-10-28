# Service capabilities

The enabled service scope is City of Toronto municipal voting information and recreation. The chat can also answer questions about Toronto One's creator using a concise, locally maintained bio adapted from [Tom Sanee's portfolio](https://www.tomsanee.com/), without a City lookup. Other municipal services, other governments and other ACTIVE tenants are outside the implemented workflows. A link from a City page does not grant execution authority over an external service.

## Voting information

Official destination: [Toronto MyVote](https://myvote.toronto.ca/home).

The public browser can use address suggestions and read the assigned voting-place information. Result cards include observed official excerpts, source links and check times. The application does not establish voter eligibility, check a resident's voter-list identity, register a voter or provide mail-in ballot status.

Address input is used for the requested lookup. Results depend on the official site's current publication state; missing or unavailable information must be reported explicitly.

After the 2026 election, MyVote was observed redirecting to the City's election information page. In that state the app explains that address-based lookup is unavailable and offers the official election page; it does not treat the redirect as a changed form or manufacture a voting-place card.

Residents can instead supply an intersection. A bounded server lookup matches the two street names against the City's Centreline Intersection Point layer, then selects the closest verified library, civic centre or community recreation centre address returned within 1.5 km. Distances are straight-line estimates. Ambiguous intersections, unavailable City data and missing matching MyVote suggestions require correction or the optional street-address flow; the model cannot invent a substitute address.

Intersection cards display the address used with a Nearby address label and a short assignment limitation. Expanding the address reveals the public facility, intersection, straight-line distance, City source records and a MyVote confirmation link. The assignment belongs to that public address; it does not establish the resident's assignment, even when nearby. Application code binds the lookup type and address to the observed MyVote result before publication.

Voting cards include an embedded Google Maps venue map and an external map link when the official result supplies a venue address. The map uses a keyless Google Maps iframe and sends only the public polling venue name and address to Google, excluding the lookup address and intersection. Map availability depends on Google and browser settings; the official address, entrance information and external link remain visible. Google Maps does not supply the election assignment or certify entrance accessibility.

## Recreation discovery

Official destination: [Toronto recreation activity search](https://anc.ca.apm.activecommunities.com/toronto/activity/search?viewMode=list), the City's Toronto ACTIVE tenant. The City also publishes [drop-in sports information](https://www.toronto.ca/explore-enjoy/parks-recreation/program-activities/sports/drop-in-sports-map/).

The agent can search public activities and inspect actual activity details. Cards use current observed descriptions and availability. Availability is a timestamped observation and can change before checkout. A listed activity, open form or successful HTTP response is not a reservation.

If the drop-in sports map reports maintenance, public discovery switches once to the City's activity catalog. The official Canoe Landing location schedule is also a reviewed public source. An alternative source does not establish proximity, a matching date, eligibility or availability: those still require actual observed evidence. If no match is verified, the app offers another public source or an inline clarification rather than a booking claim.

## Zero-dollar recreation reservation

This adapter enrolls a participant in a listed activity. Timed court reservations use the separate tennis workflow below; other facility types receive official discovery and resident-controlled booking guidance.

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

## Tennis court reservation preview

Official discovery starts at the City’s [court schedule](https://anc.ca.apm.activecommunities.com/toronto/reservation/landing/quick?groupId=2), separate from activity search. Public court resources and booking reminders are evidence; accurate slot availability requires City sign-in. The application extracts full accessible court names, including resources inside the schedule’s component tree, and binds each published court card to a fresh observed resource. It does not infer proximity or availability from a court name.

The first implementation supports personal match play for 1–9 attendees, one-hour times from 8 a.m. to 10 p.m., and dates from today through seven days ahead. These are application bounds; the City’s actual court/date rules still apply. The resident chooses the date, time, group size and maximum total, which defaults to $0. A zero balance due after applying an account credit does not make a nonzero total free.

After direct City sign-in, the adapter opens the dedicated schedule, selects the requested date and brings the exact court into view. The resident selects the City participant and available slot and personally completes any required booking questions, declarations and signatures to reach the cart. Unknown controls require resident attention. The adapter never presses Pay or Finish, signs a declaration or accepts legal terms for the resident.

Before payment handoff, the application requires a single matching court/date/time item, the booking name, matching attendee count and a verified complete total within the maximum. A fresh review is bound to this payload and rechecked when the resident continues. An outbound handoff journal is persisted before returning control for checkout. The resident completes payment directly with the City only if the details remain correct.

Confirmation requires a numbered official receipt, matching facility evidence in the City account, and an official permit document with the same court, date, start/end times, booking name, charge and permit number plus an explicit active/issued/confirmed status. Missing, pending, changed, cancelled or ambiguous evidence remains unconfirmed; the application never retries payment. Permit images/PDFs remain private and owner-bound, with the existing checkpoint retention. PDF export failure preserves a verified permit and allows a document-only retry.

Owned fixtures exercise the cart and permit contracts without storing real resident records. A resident-authorized live walkthrough verified sign-in, date/court selection, declarations, signature upload, the unpaid payment screen and the $0 charge-ceiling stop. Quick reservations use `/toronto/quickreservation/checkout`; review reads the existing general cart, expands the single quick-reservation item and validates its booking-name heading, exact court, interval and attendee fields. Subtotal plus tax remains the full charge even when account credit lowers the balance due. The unpaid test item was removed and the City cart verified empty. Completed reservation, account-record and permit-document compatibility remain unverified. An unsupported layout or direct-PDF document stops verification rather than fabricating a permit. See [validation](VALIDATION.md).

## Broader recreation assistance

The concierge routes activities, tennis, other facilities and memberships to their appropriate official guidance. Paid activity enrollment, memberships, cancellation, organization permits and other facility transactions remain resident-controlled City workflows. The capability guide describes the application’s actual assistance and does not grant new transaction authority. Current costs, rules and availability still require fresh official evidence.
