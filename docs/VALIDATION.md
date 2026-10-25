# Validation

## Automated checks

Run the complete local suite with the pinned package manager:

```sh
corepack pnpm@10.34.8 check
```

The suite runs repository formatting, ESLint, Next.js route generation, strict TypeScript, Node tests and a production build. TypeScript keeps `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. The build does not replace the separate lint stage.

The 34 tests cover browser scope and action policy, source evidence, approval payload binding and expiry, duplicate/unknown submission protection, receipt parsing, checkpoint ownership and retention, model-visible privacy, mascot state mapping and animation playback contracts.

## Public browser and model checks

```sh
node scripts/verify-browser.mts
# Requires a running app, .env.local and billable model access:
corepack pnpm@10.34.8 test:live
```

The browser check exercises the shared public executor. The live check requires actual model streaming, model-selected tools and sourced results for voting and recreation. These checks do not authenticate to a private City account or submit a reservation. External portal failures are test failures or explicit unavailable results, never a reason to fabricate a card.

Real reservation validation requires a resident-controlled City session, personal acceptance of applicable waivers and explicit approval of the exact activity, participant and amount. It must not be part of an unattended test suite. Private receipts and account records are not repository fixtures.

## Interface coverage

The interface has been reviewed at narrow mobile and desktop widths, in light and dark appearance, and in iOS Simulator Safari with software keyboards. Checks include multiline input, retained drafts, sheet dismissal and focus restoration, source disclosure, reading-position continuity, approval gating, real streamed progress and receipt actions. Visual checks use public example addresses and unsubmitted recreation activities, without resident records.

Mascot checks cover all seven states, atlas geometry and alpha, loop/hold behavior, rapid state changes, offscreen suspension, reduced motion and image-failure fallback.

The desktop sidebar has been checked at 960px, 1440px and 1920px in both themes, including keyboard access to Settings, active navigation, retained drafts and overflow. At 390px, the header, content, composer and bottom navigation retain their previous geometry in both themes.

Tasks and Settings cleanup was checked at 390px and 1440px in both themes. The task count sits 12px beside its heading; the empty Tasks page has no account sign-in panel or results notice. Settings contains the City account controls and no former independence/animation footer. Browser-only contract fixtures confirmed that an active reservation and receipt remain in Tasks and are omitted from the account-only Settings panel; no City booking was submitted. The isolated deployment snapshot passed `pnpm check` (38 tests and a production build); the shared checkout also passed lint, type checking and all 52 tests.

Remote build defaults were verified end to end on October 25, 2026. `pnpm run deploy` dispatched a pushed source revision to GitHub, ran formatting/lint/type generation/strict TypeScript, all 41 release tests and the production build remotely, removed temporary registry secrets, deployed the prebuilt image and verified matching configured/running digests. The subsequent `pnpm check` repeated remote verification without deploying; the live image remained unchanged. Local guard tests cover rejection of Dockerfile configurations and mutable tags, ambiguous image evidence and mismatched health responses. A dirty checkout was rejected before uploading or requesting a build. Docker Desktop remained stopped.

## Hosted verification

The Cloudflare deployment has been exercised through the public domain with real AI streaming and model-selected browser tools. MyVote returned address-specific voting-place details, hours and entrance information for an official public example address. Recreation discovery returned a live activity, availability and fee warning. The actual City sign-in page loaded inside the conversation through the owner-bound private-browser WebSocket; no credentials were entered and no reservation was submitted during hosted verification.

Conversation and result restoration after refresh, empty results for an unrelated anonymous visit, rejection of cross-origin chat requests, denial of browser access without an owner cookie, and protection of the private ledger endpoint were checked on the public host. The portfolio root and apex-to-www redirect continue to respond normally.

## Remaining limits

- Physical iPhone, comprehensive VoiceOver, Larger Text, rotation and device performance testing remain incomplete.
- Simulator and desktop checks do not establish full accessibility conformance or mobile frame pacing, power use and OS throttling behavior.
- A continuous natural-language-to-confirmed-booking latency guarantee has not been established. Human authentication, waiver review and approval take variable time.
- Gateway/model timing includes network and provider overhead. City page loading and portal timeouts can dominate the run; a warm session is not a latency guarantee.
- The private adapter supports the reviewed zero-dollar reservation path. Paid checkout, cancellation, broad activity coverage and unsupported forms are unverified or disabled.
- The local single-process session model is not production identity, durable task execution or a storage service.
- Linux browser checks verify actual City sign-in loading, per-resident operating-system isolation and denial of server-file/environment access. A completed public-host login and a new official receipt still require resident-controlled review; unattended verification does not make a reservation.

After dependency changes, also run `corepack pnpm@10.34.8 install --frozen-lockfile`. Before distributing a build, inspect output traces and assets to ensure environment files, private runtime records and unnecessary metadata are excluded.
