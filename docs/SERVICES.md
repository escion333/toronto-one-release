# Service capabilities

The enabled scope is City of Toronto municipal voting information and recreation. Other municipal services, other governments and other ACTIVE tenants are outside the implemented workflows. A link from a City page does not grant execution authority over an external service.

## Voting information

Official destination: [Toronto MyVote](https://myvote.toronto.ca/home).

The public browser can use address suggestions and read the assigned voting-place information. Result cards include observed official excerpts, source links and check times. The application does not establish voter eligibility, check a resident's voter-list identity, register a voter or provide mail-in ballot status.

Address input is used for the requested lookup. Results depend on the official site's current publication state; missing or unavailable information must be reported explicitly.

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
