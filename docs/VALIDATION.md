# Validation

## Automated checks

Run the complete local suite with the pinned package manager:

```sh
corepack pnpm@10.34.8 check
```

The suite runs repository formatting, ESLint, Next.js route generation, strict TypeScript, Node tests and a production build remotely on GitHub, without deploying. It requires the intended source to be committed and pushed; a dirty checkout is rejected before upload. Do not run `check:ci` or an application production build on this Mac. Local formatting, lint, type checking and tests can run independently. TypeScript keeps `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. The build does not replace the separate lint stage.

The automated tests cover browser scope and action policy, source evidence, approval payload binding and expiry, duplicate/unknown submission protection, receipt parsing, checkpoint ownership and retention, model-visible privacy, timed keep-awake renewal and expiry, mascot state mapping and animation playback contracts.

Chat-source tests additionally cover exact excerpt validation, stale/missing observations, unsafe links, unique-page counts across repeated browser steps, exclusion of failed/unfinished steps, distinct search filters, citation-only source selection, preservation of per-observation check times, linked-listing attribution, legacy results and serialized conversation restoration. These are controlled contract fixtures, not recorded City responses or live availability.

Voting tests cover intersection parsing, ambiguous and divided-street crossings, verified public-facility selection, distance bounds, missing City data, library-name fallback, browser-bound example labels, immutable earlier results and venue-only map queries. Retained messages with missing or duplicate IDs are repaired to stable distinct IDs, and new assistant streams generate IDs explicitly.

## Public browser and model checks

```sh
node scripts/verify-browser.mts
# Requires a running app, .env.local and billable model access:
corepack pnpm@10.34.8 test:live
```

The browser check exercises the shared public executor. The live check requires actual model streaming, model-selected tools and sourced results for voting and recreation. These checks do not authenticate to a private City account or submit a reservation. External portal failures are test failures or explicit unavailable results, never a reason to fabricate a card.

Real reservation validation requires a resident-controlled City session, personal acceptance of applicable waivers and explicit approval of the exact activity, participant and amount. It must not be part of an unattended test suite. Private receipts and account records are not repository fixtures.

## Interface coverage

The intersection voting flow was checked locally on October 25, 2026 with live City GIS data, MyVote navigation and model-selected lookup/publication tools. The returned public example address and polling venue remained distinct through refresh. The actual Google Maps widget rendered a venue pin without an API key. Mobile and desktop checks cover both themes, overflow, keyboard operation and visible focus in the example disclosure, direct button submission without a checkbox, and the optional street-address mode. These local checks do not establish deployment of the new voting features or comprehensive map accessibility.

The interface has been reviewed at narrow mobile and desktop widths, in light and dark appearance, and in iOS Simulator Safari with software keyboards. Checks include multiline input, retained drafts, sheet dismissal and focus restoration, source disclosure, reading-position continuity, approval gating, real streamed progress and receipt actions. Visual checks use public example addresses and unsubmitted recreation activities, without resident records.

Mascot checks cover all seven states, atlas geometry and alpha, loop/hold behavior, rapid state changes, offscreen suspension, reduced motion and image-failure fallback.

The desktop sidebar has been checked at 960px, 1440px and 1920px in both themes, including keyboard access to Settings, active navigation, retained drafts and overflow. At 390px, the header, content, composer and bottom navigation retain their previous geometry in both themes.

The collapsed chat-source disclosure was checked locally with a real model-selected MyVote home-page observation and validated supporting excerpts. Checks included the actual external link opening in a new tab, Enter/Space expansion, visible keyboard focus, 44px summary/link targets, refresh restoration, no horizontal overflow at 390px and 1280px, and light/dark appearance. The browser console reported no warnings or errors during this check. The complete `pnpm check` suite passed, including 49 tests and a production build. This was a read-only home-page check; it did not look up a resident address, check registration or submit a reservation. Recreation listing attribution and duplicate counts were verified with contract fixtures rather than another live portal lookup.

The subsequent minimal-copy refinement was checked with another live MyVote home-page reply: one sentence, a **Sources · 1** disclosure, one exact excerpt preview and its matching compact check time. Mobile (390px) and desktop (1280px), light/dark appearance, 44px targets, keyboard expansion, accessible full timestamp and browser-console checks passed. Full citation metadata and unique-source counting remain unchanged. The complete `pnpm check` passed with 51 tests and a production build. Expanded previews show at most three lines from the first supporting excerpt; earlier conversation text is retained as originally generated.

Tasks and Settings cleanup was checked at 390px and 1440px in both themes. The task count sits 12px beside its heading; the empty Tasks page has no account sign-in panel or results notice. Settings contains the City account controls and no former independence/animation footer. Browser-only contract fixtures confirmed that an active reservation and receipt remain in Tasks and are omitted from the account-only Settings panel; no City booking was submitted. The isolated deployment snapshot passed `pnpm check` (38 tests and a production build); the shared checkout also passed lint, type checking and all 52 tests.

Remote build defaults were verified end to end on October 25, 2026. `pnpm run deploy` dispatched a pushed source revision to GitHub, ran formatting/lint/type generation/strict TypeScript, all 41 release tests and the production build remotely, removed temporary registry secrets, deployed the prebuilt image and verified matching configured/running digests. The subsequent `pnpm check` repeated remote verification without deploying; the live image remained unchanged. Local guard tests cover rejection of Dockerfile configurations and mutable tags, ambiguous image evidence and mismatched health responses. A dirty checkout was rejected before uploading or requesting a build. Docker Desktop remained stopped.

The final stacked wordmark was integrated and checked locally on October 25, 2026 at 320px, 390px, 960px and 1440px widths in both themes. Checks covered the shared header/sidebar artwork across Chat, Tasks and Settings, preserved proportions, black/white treatment, explicit appearance switching, no horizontal overflow, keyboard focus and 44px navigation targets. Browser and Apple touch icon URLs returned the new assets. After clearing the stale generated development cache, all eight browser checks passed with normal development updates enabled and no page or console errors. Local lint, strict TypeScript and all 55 tests passed. `pnpm check` stopped at its clean-checkout prerequisite because the shared checkout contains uncommitted work; the remote production build and deployment of this branding update remain unverified.

## Landing integration (local)

The landing and `/chat` route integration was verified locally on October 25, 2026. The landing was reviewed at 320px, 390px, 820px, 1280px and 1440px widths, including direct `#services` navigation, scrolling, keyboard skip/navigation focus, internal Start chat navigation and browser Back. Its light appearance remains unchanged with the concierge's dark preference selected; the concierge was checked in both themes and the original light preference restored. All 60 service labels remain static, with Voting and Recreation first at the same type size. Footer links have 44px targets and the maple leaf sits outside the author link.

The final mascot is a fresh 2048px transparent render from the original Blender rig with native fur, materials, lighting and approved framing retained. The four actual WebP widths are 768, 1024, 1536 and 2048px (113, 197, 434 and 624 KiB respectively); dimensions and alpha were verified, and final desktop/mobile images were reviewed. The landing loads no Three.js prototype, low-resolution idle loop or tracking/wave interaction. Standalone preview assets use the same final exports. Local formatting, lint, route generation, strict TypeScript and all 55 tests passed. The initial `pnpm check` stopped at its clean-source prerequisite; the subsequent committed release passed the full remote pipeline described below. No model lookup, City authentication or reservation was performed for these initial navigation checks.

## Hosted verification

### Launch availability policy

The October 25 launch-availability change passed local formatting, lint, strict TypeScript and all 83 tests, including fixed-window expiry, FIFO ordering/cancellation, phase-separated turn budgets, edge bursts, per-model-call durable spend reservations, unknown outcomes and booking-journal regressions. A real local six-visitor test completed with three active and three queued requests, independent cookies and retained messages/results, and sourced voting and recreation results. No booking was prepared or submitted. Provider team/key budgets and 50/75/100 percent alerts were configured and read back; no credit purchase or auto top-up change was made.

The launch image was built remotely from source `44267f7` in [GitHub run 40197286440](https://github.com/escion333/toronto-one-release/actions/runs/40197286440), with all remote checks passing and temporary registry credentials removed. Cloudflare initially rejected module-scope random generation in the edge admission guard. Source `cb5d0a1` moves salt creation into request handling; the corrected Worker reused the existing image without another build or test run. Worker version `23bcfeb2-bf15-4bf7-89ca-97c8db826876` deployed successfully. Public health then confirmed identical configured/running image digests (`sha256:baae4963e827f9f5bd7801ea980a505c1eb9d991a5e6ff3f2570dcc87582cd79`), an active launch policy, and zero active/queued requests at the readout. The immutable image pin is retained in the canonical Wrangler configuration. No production multi-visitor load test was performed after the user's instruction to stop testing; the six-visitor evidence above is local.

Cloudflare's authenticated container-instance API independently confirmed the new image running with 2 vCPU, 8,192 MiB RAM and 16,384 MB disk in `ord08`, with running status updated at `2026-10-25T13:30:33.200Z`. These are actual allocation values, not health start labels; CPU/RAM utilization was not measured.

The canonical release repository was made public after checking its published branch history for private paths and credentials; the historical archive remains private. This publication check is not a comprehensive security audit.

The October 25 City sign-in usability patch replaces the invisible keyboard helper with a visible masked typing/paste input and an explicit clipboard-paste button, adds a browser full-screen control, and changes new private City browsers from a 430px mobile viewport to a 1280px desktop viewport. Local strict TypeScript, focused ESLint and all 55 tests passed. Hosted paste delivery, responsive/theme review and deployment of this patch remain pending at this source revision; the earlier hosted checks below do not establish that the clipboard patch is live. No credentials or booking submission were used for these local checks.

The final demo release was deployed on October 25, 2026 from source `19ab906` through [GitHub run 40194522012](https://github.com/escion333/toronto-one-release/actions/runs/40194522012). Remote formatting, ESLint, route generation, strict TypeScript, all 55 tests and the production build passed. Cloudflare Worker version `5d74cf6a-a1ce-4b1f-812c-00395400c3f1` serves the image pinned in `deploy/cloudflare/wrangler.jsonc`; public health confirmed identical configured and running digests. Temporary registry secrets were verified removed. Docker and production builds were not run locally.

Live browser verification confirmed the light landing at `/toronto-one`, its internal Start chat link to `/toronto-one/chat`, loaded final artwork, and a completed real model reply identifying the creator. No browser warnings or errors were reported. Landing, chat, favicon, Apple icon and the full-resolution mascot returned HTTP 200; the served 2048px WebP hash matched the release asset. This final smoke check did not authenticate with the City or submit a reservation.

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
