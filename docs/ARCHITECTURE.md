# Architecture

Toronto One is a Next.js App Router application with one AI model and two City of Toronto service workflows. The model reasons and selects tools; application code controls validation, permissions and confirmation.

## Landing and concierge routes

`src/app/page.tsx` composes the server-rendered landing from `src/components/landing`; `src/app/chat/page.tsx` composes the existing concierge. The production base path remains `/toronto-one`, so the public entry is `https://www.tomsanee.com/toronto-one` and **Start chat** navigates internally to `/toronto-one/chat`. Without a local base path, the corresponding routes are `/` and `/chat`.

The landing has scoped light-only styles and responsive static WebP assets in `public/landing`, including a transparent render of the original native-groom mascot. It loads no Three.js renderer and performs no service lookup or transaction. The concierge keeps its existing theme preferences, seven-state `AgentMascot` boundary and server-side service policies.

## Request flow

Launch admission is clock-based and shared by the Worker and server. The Worker applies a bounded, salted per-IP burst guard; the server claims visit ownership before waiting in a FIFO execution queue. The SSE response and visit cookie start while waiting, with keep-alive comments and cancellation support. Queued work consumes no model turn or browser context. Public City contexts close after each run; conversation, results and validated source excerpts remain isolated per visit. Private booking browsers retain their existing ownership and approval boundaries.

Every model invocation passes through spend middleware before contacting the provider. A transactional host ledger reserves a conservative token-cost bound and only settles down after known completed usage; errors, missing usage and cancellations retain the hold. SDK telemetry callbacks are not admission gates because their errors are swallowed. The fixed 48-hour policy, durable spend bucket and phase-separated daily turn counters cannot be extended or reset by redeployment. See [Hosting](HOSTING.md) for operating limits and operator commands.

1. The client sends the latest resident message to a same-origin route.
2. The server validates the request and uses its canonical conversation in an isolated anonymous session.
3. An AI SDK `ToolLoopAgent` calls the configured model through Vercel AI Gateway and chooses bounded tools.
4. Public browser tools navigate reviewed official destinations and return observed text and control references.
5. Application validators check source excerpts and structured results before publishing cards.
6. The client streams real message and tool events into the conversation, progress display and mascot state.

There is one shared public browser implementation with isolated session contexts and serialized operations. Model tools do not accept arbitrary JavaScript or unrestricted navigation. Exact host/path rules and action allowlists are enforced outside the model. Retrieved page content is evidence, not trusted instructions. Matching a quoted excerpt establishes provenance, not complete semantic correctness.

The voting lookup tool accepts either a street address or an intersection. Intersection resolution uses fixed City GIS intersection and public-facility endpoints with validated, escaped street-name queries, bounded distances and response validation. It grants no additional model-controlled browser destinations. The browser binds the chosen lookup context to address-matching MyVote observations; published voting cards inherit that context and the parsed official venue. Google Maps is a presentation-only iframe built from the venue address, separate from City browser execution and credentials.

### Chat sources

Each assistant reply has one collapsed source disclosure. `publishResult` attaches supporting citations automatically; `citeSource` attaches exact excerpts for ordinary factual replies without creating a result card. The server resolves observation IDs to the actual page URL, title and check time, checks freshness and verifies excerpt support. Linked recreation listing excerpts retain their own observation metadata rather than inheriting the detail page's timestamp.

The disclosure counts unique approved page URLs, ignoring fragments, query ordering and trailing slashes while preserving distinct search filters and activity IDs. Repeated citations share one source entry; excerpts from different observations keep their original check times in metadata. The UI shows one excerpt preview per source with its matching observation time. Without selected supporting excerpts, successful browser observations appear as **Pages checked** rather than **Sources**. Failed and unfinished steps do not add sources. Chat result cards share the reply's disclosure; Tasks retain their own disclosure. Citation metadata stays in the existing temporary server conversation and results, with no browser-storage persistence.

## Private recreation execution

The authenticated booking adapter is separate from the model-visible public browser. The resident authenticates directly in a temporary City browser. Account pages, passwords, MFA input and receipt contents do not enter model context.

The private browser opens at a desktop viewport (1280px wide) and scales into the conversation, with a resident-controlled full-screen option. A Paste into City field button reads the local clipboard only on a resident click and forwards characters over the existing private browser connection. A visible masked input also supports native paste and typing, clearing its DOM value immediately. Input content is not retained in React state, browser storage, chat, telemetry or the remote clipboard. If clipboard permission is unavailable, residents can use the masked input instead.

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

Anonymous ownership uses an HTTP-only, same-site cookie. Canonical public conversation and findings live in process memory, with a 20-minute inactivity limit and a small session cap. The hosted container provides the same temporary continuity; it does not provide durable task infrastructure.

A minimal, owner-bound confirmed-booking checkpoint may restore the verified Task for 20 minutes. It excludes selection lists, executable approvals and City credentials. The checkpoint does not authorize a new write or restore an authenticated browser.

Private receipts, account evidence and write-safety journals remain under ignored `.local/booking`, with restrictive filesystem permissions. Receipt delivery requires session ownership. Clearing a session removes its checkpoint and closes browser contexts; evidence and duplicate-prevention journals remain on disk. Next.js build tracing excludes private runtime records and environment files.

## Operational limits

The hosted configuration routes `/toronto-one` through one Cloudflare Durable Object to a single container. Its authenticated same-origin WebSocket forwards a private City desktop to the resident inline. Each private Chromium process has a separate unprivileged Linux UID, profile, display and restricted environment. Server files and AI credentials are inaccessible to that browser. Control pauses while the booking adapter operates.

A durable, secret-protected ledger stores hashed submission-attempt markers and daily turn counts. It contains no credentials, names or receipt contents. Conversation, authenticated browser and receipt evidence remain temporary within the container; a restart clears them. There is no notification service or unattended booking agent. See [Hosting](HOSTING.md).

Browser timing spans record phase, duration and outcome without page content or credentials. Provider timing includes model, Gateway and network time; it does not isolate model compute.
