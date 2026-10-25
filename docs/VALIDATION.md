# Validation

## Automated checks

Run the complete local suite with the pinned package manager:

```sh
corepack pnpm@10.34.8 check
```

The suite runs repository formatting, ESLint, Next.js route generation, strict TypeScript, Node tests and a production build. TypeScript keeps `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. The build does not replace the separate lint stage.

The 27 tests cover browser scope and action policy, source evidence, approval payload binding and expiry, duplicate/unknown submission protection, receipt parsing, checkpoint ownership and retention, model-visible privacy, mascot state mapping and animation playback contracts.

## Public browser and model checks

```sh
node scripts/verify-browser.mts
# Requires a running app, .env.local and billable model access:
corepack pnpm@10.34.8 test:live
```

The browser check exercises the shared public executor. The live check requires actual model streaming, model-selected tools and sourced results for voting and recreation. These checks do not authenticate to a private City account or submit a reservation. External portal failures are test failures or explicit unavailable results, never a reason to fabricate a card.

Real reservation validation requires a resident-controlled City session, personal acceptance of applicable waivers and explicit approval of the exact activity, participant and amount. It must not be part of an unattended test suite. Private receipts and account records are not repository fixtures.

## Interface coverage

The interface has been reviewed at narrow mobile and desktop widths, in light and dark appearance, and in iOS Simulator Safari with software keyboards. Checks include multiline input, retained drafts, sheet dismissal and focus restoration, source disclosure, reading-position continuity, approval gating, real streamed progress and receipt actions. Labelled synthetic scenes support visual checks without using resident records.

Mascot checks cover all seven states, atlas geometry and alpha, loop/hold behavior, rapid state changes, offscreen suspension, reduced motion and image-failure fallback.

## Remaining limits

- Physical iPhone, comprehensive VoiceOver, Larger Text, rotation and device performance testing remain incomplete.
- Simulator and desktop checks do not establish full accessibility conformance or mobile frame pacing, power use and OS throttling behavior.
- A continuous natural-language-to-confirmed-booking latency guarantee has not been established. Human authentication, waiver review and approval take variable time.
- Gateway/model timing includes network and provider overhead. City page loading and portal timeouts can dominate the run; a warm session is not a latency guarantee.
- The private adapter supports the reviewed zero-dollar reservation path. Paid checkout, cancellation, broad activity coverage and unsupported forms are unverified or disabled.
- The local single-process session model is not production identity, durable task execution or a storage service.
- Optional custom-server and remote-browser plumbing has not been validated at runtime. Remote City browsing is disabled by default and is not connected to the interface; no deployment is established.

After dependency changes, also run `corepack pnpm@10.34.8 install --frozen-lockfile`. Before distributing a build, inspect output traces and assets to ensure environment files, private runtime records and unnecessary metadata are excluded.
