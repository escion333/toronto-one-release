# Architecture

Toronto One is a local Next.js App Router application with one AI model and two City of Toronto service workflows. The model reasons and selects tools; application code controls validation, permissions and confirmation.

## Request flow

1. The client sends the latest resident message to a same-origin route.
2. The server validates the request and uses its canonical conversation in an isolated anonymous session.
3. An AI SDK `ToolLoopAgent` calls the configured model through Vercel AI Gateway and chooses bounded tools.
4. Public browser tools navigate reviewed official destinations and return observed text and control references.
5. Application validators check source excerpts and structured results before publishing cards.
6. The client streams real message and tool events into the conversation, progress display and mascot state.

There is one shared public browser implementation with isolated session contexts and serialized operations. Model tools do not accept arbitrary JavaScript or unrestricted navigation. Exact host/path rules and action allowlists are enforced outside the model. Retrieved page content is evidence, not trusted instructions. Matching a quoted excerpt establishes provenance, not complete semantic correctness.

## Private recreation execution

The authenticated booking adapter is separate from the model-visible public browser. The resident authenticates directly in a temporary City browser. Account pages, passwords, MFA input and receipt contents do not enter model context.

The adapter prepares the reviewed activity and participant/cart flow. The resident selects the participant and personally accepts the City waiver. Before submission, application code requires a fresh approval bound to the exact activity, participant, zero-dollar amount and accepted terms. It rechecks the cart and persists an atomic outbound intent before pressing Finish once.

Confirmation requires an official numbered receipt and matching enrollment evidence in the City account. Printable receipt capture is a separate operation: an export failure must not resubmit an already confirmed reservation. An uncertain submission outcome blocks retry and requires reconciliation. Unsupported forms, security challenges and nonzero totals stop for resident attention.

## Code boundaries

| Location                   | Responsibility                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/app`                  | Routes, server endpoints, layout, fonts and semantic style tokens                                        |
| `src/components/ui`        | Shared shadcn/Radix primitives                                                                           |
| `src/components/concierge` | Conversation, result cards, Tasks, account controls and booking review                                   |
| `src/components/agent`     | Mascot presentation and bounded animation playback                                                       |
| `src/lib/ai`               | Model configuration, tools, browser policy, sessions, validation, booking approval and evidence handling |
| `src/lib/demo`             | Shared seven-state mascot constants and type                                                             |
| `scripts`                  | Public-browser and live-model verification                                                               |
| `tests`                    | Domain, policy, approval, privacy and playback tests                                                     |

## Sessions and retention

Anonymous ownership uses an HTTP-only, same-site cookie. Canonical public conversation and findings live in process memory, with a 20-minute inactivity limit and a small session cap. This is local continuity, not durable task infrastructure.

A minimal, owner-bound confirmed-booking checkpoint may restore the verified Task for 20 minutes. It excludes selection lists, executable approvals and City credentials. The checkpoint does not authorize a new write or restore an authenticated browser.

Private receipts, account evidence and write-safety journals remain under ignored `.local/booking`, with restrictive filesystem permissions. Receipt delivery requires session ownership. Clearing a session removes its checkpoint and closes browser contexts; evidence and duplicate-prevention journals remain on disk. Next.js build tracing excludes private runtime records and environment files.

## Operational limits

The validated usage expects a local desktop browser for City authentication and a single server process. Optional custom-server, URL-prefix and remote-browser plumbing is included. The custom server has a WebSocket forwarding path for noVNC; remote City browsing is disabled by default, is not connected to the interface and has not been validated at runtime. This path is not deployment-ready. There is no production identity system, durable queue, database, notification service or unattended booking agent.

Browser timing spans record phase, duration and outcome without page content or credentials. Provider timing includes model, Gateway and network time; it does not isolate model compute.
