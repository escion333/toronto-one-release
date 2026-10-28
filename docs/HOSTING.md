# Hosting

Toronto One is configured for `https://www.tomsanee.com/toronto-one`. The apex domain redirects to www. Existing portfolio paths remain on their current host.

## Runtime

Cloudflare Workers Paid and Containers run the custom Next.js server, streaming AI responses and private browser WebSockets. `deploy/cloudflare/wrangler.jsonc` defines the routes and container image. Docker build input excludes environment files, private runtime data and Git history.

Install these Worker secrets through Wrangler or the Cloudflare dashboard: `AI_GATEWAY_API_KEY` and a random, independently generated `PRIVATE_STORE_TOKEN`. Never commit values or expose them through `NEXT_PUBLIC_*`. The Worker passes runtime secrets only to the server; resident Chromium receives a restricted environment.

## Deploy updates

Commit the intended changes and push them to `origin`, then run:

```sh
pnpm run deploy
```

This is the default deployment path. It runs formatting, lint, type checking, tests and the production image build on a GitHub-hosted Linux runner, then deploys the prebuilt image to Cloudflare. Local Docker is not used or started. `pnpm check` runs the same remote checks and image build without deploying. `pnpm deploy:check` validates the prebuilt-image configuration without building or deploying.

The command uses your existing GitHub CLI and Wrangler sign-ins. It creates registry credentials that expire after one hour, passes them through temporary repository Actions secrets, and removes those secrets after the build, including failed builds. It never uploads local environment files or sends application credentials to GitHub. If interrupted, let the existing GitHub run finish and reconcile its status and temporary secrets before retrying; the command refuses overlapping runs or leftover credentials.

The build is tied to the pushed source commit. Uncommitted files are never uploaded. After deployment, the command waits for the public health endpoint to report the exact configured and running image digest, then updates the canonical Wrangler image pin. Include that pin in the next commit. A startup timeout requires checking the live image; it does not automatically redeploy.

The deployment command also embeds that digest into the Worker through `TORONTO_ONE_DEPLOY_IMAGE`. This makes an application-image-only release change the Durable Object controller code and supplies its desired image explicitly, rather than relying only on an already-instantiated image map. A reported Worker upload alone is not activation evidence: configured/running digests must match the intended release before recording its pin.

[Cloudflare propagates Worker and Durable Object code eventually consistently](https://developers.cloudflare.com/durable-objects/platform/known-issues/#code-updates), so a new Worker can briefly call the previous controller version. The command's health polling can end before that update becomes visible. Reconcile the accepted Worker version and its image map, allow propagation, then check public health again; do not submit another deployment merely because health still reports the preceding image. Record the canonical pin only after both live digests match the accepted release.

The canonical Wrangler config also references a prebuilt image, so directly invoking Wrangler cannot trigger a local Docker build. Use `pnpm run deploy` for source updates; a bare Wrangler deployment only selects the already configured image. Keep Docker Desktop off. The Dockerfile and `pnpm check:ci` are for the remote runner; do not run the production check/build locally.

## Preview limits

The launch window starts at the original public deployment, October 25, 2026 at 8:50:40 a.m. Toronto time. On October 26, the operator authorized a seven-day extension for visitors from the prize announcement: the deadline moves from October 27 to November 3 at 7:50:40 a.m. Toronto time (`2026-11-03T12:50:40.350Z`), exactly seven days after the original expiry. Toronto's clock change accounts for the earlier local hour. The full window is nine elapsed days. Restarts and deployments do not roll this fixed deadline forward. `src/lib/ai/launch-policy.ts` applies the current policy at request time, including requests from existing visits.

| Policy                               | During the extended launch        | After the launch                 |
| ------------------------------------ | --------------------------------- | -------------------------------- |
| Model turns per UTC day              | 5,000                             | 250                              |
| Turns per visit                      | 100                               | 40                               |
| Temporary visitor sessions           | 200                               | 80                               |
| Active model runs                    | 3                                 | 2                                |
| Waiting requests                     | 80                                | 40                               |
| Maximum queue wait                   | 240 seconds                       | 240 seconds                      |
| Capacity on the next container start | 2 vCPU, 8 GiB RAM, 16,384 MB disk | 1 vCPU, 4 GiB RAM, 8,192 MB disk |

Requests wait for a bounded execution slot rather than opening an unbounded number of browsers. A model turn has a three-minute execution budget and bounded tool steps. Failed model runs also consume quota. The two private City desktop slots remain unchanged. Temporary session capacity is not a promise that every visitor executes at once.

The application uses conservative durable AI spend accounting: US$45 total for the entire extended launch and US$3 per UTC day afterward, alongside the provider team/key's US$50 budget and alerts at 50%, 75% and 100%. The extension preserves the original `launch-2026-10-25` spend bucket and all previously accounted usage; it neither resets the allowance nor purchases credits. Provider credit availability can be lower than the configured cap. Turn limits do not establish an exact model bill; the provider cap and application accounting remain separate protections.

Model execution remains limited to 18 steps per turn, 1,800 output tokens per call and three minutes per turn, with no automatic model retries. Per-visit burst admission allows 12 requests per minute. Spend reservations include serialized text/tool bytes plus framing overhead at US$4/M input and US$15/M output; input is capped at 240,000 bytes. Known standard-context usage settles at US$2.50/M input (including a conservative cache-write allowance) and US$10/M output. Unknown outcomes retain the full reservation. These accounting bounds assume the verified model prices and enforced text-only call shape; they are not provider billing guarantees. Provider budgets are soft caps and may admit in-flight overshoot, so they supplement the application guard.

The team and `toronto-one` key have cumulative, non-resetting US$50 provider budgets, with email alerts at US$25, US$37.50 and US$50. Team alerts go to owners/billing members; key alerts go to its creator. Existing team spend is included in its cap. This deployment uses existing credits without purchasing more or changing auto top-up. Check the account dashboard for the private balance and funding settings. Credit exhaustion can stop model requests before any application allowance; landing and existing application surfaces remain accessible. Ongoing funding after the judging window remains an operator decision.

At the verified standard rates, an 8,000-input/500-output-token reply is about US$0.021; a multi-step discovery totaling 100,000 input and 3,000 output tokens is about US$0.23, before caching. Actual tool steps/context vary. The accounting guard is deliberately more conservative than these examples. The launch container's 48-hour provisioned RAM/disk estimate is about US$3.65 plus CPU use, at most about US$10.56 if both CPUs are continuously occupied, before included allowances and excluding Workers/Durable Objects/network/model charges. This is estimated exposure, not a measured bill. Sources: [model catalog](https://ai-gateway.vercel.sh/v1/models), [Gateway budgets](https://vercel.com/docs/ai-gateway/observability-and-spend/budgets), [Cloudflare pricing](https://developers.cloudflare.com/containers/platform/pricing/).

### Launch monitoring

Run `node --env-file=.env.local scripts/launch-status.mts` for aggregate active/queued work, fixed expiry, configured/start-request capacity and Gateway balance/lifetime spend. It prints no API key or resident content. The live `/toronto-one/api/health` also reports aggregate admission and image status. Use the Vercel team's AI Gateway **Budgets**, **Logs** and credit balance to monitor actual billed tokens/cost, failures and latency; this Hobby account does not support paid Custom Reporting. Cloudflare's container dashboard/metrics show actual allocation and CPU/RAM utilization; start labels are not measurements. Limits take effect without a scheduler or redeployment, and expiry never stops the application.

`node scripts/verify-launch.mts --live` explicitly spends model credits on six independent cookie-isolated visitors, including real public voting and recreation discovery. It verifies FIFO load handling, separate retained messages/results and no booking preparation. Set `TORONTO_ONE_TEST_URL` to a local URL to run against development. No test signs into a City account, accepts a waiver or submits a reservation.

At the edge, chat submissions have a soft per-IP token bucket with a burst of 60 requests and continuous refill at 60 per minute. Requests without a well-formed visit cookie have a separate burst of 30, refilling at 30 per minute, to accommodate judging groups on one network. Cloudflare's connecting-IP header is hashed with SHA-256 and a random per-isolate salt before entering the bounded 4,096-entry memory map. Raw IPs are neither stored nor logged by this limiter; idle entries expire after two minutes. Edge memory is not globally coordinated, and recognizing a cookie does not authenticate a session. Durable spend controls and application ownership checks remain authoritative. Throttled requests receive a short retry delay without signup or visible quota counters.

Health reports distinguish the configured capacity for the next start from the capacity recorded in the running container's start labels. These labels are audit metadata, not measured allocation or CPU/RAM utilization. Verify actual resources through Cloudflare's container-instance API. The launch profile is not forcibly resized or restarted at expiry, which could interrupt a private City booking; it remains until the next natural start while application limits drop immediately.

Conversations and results expire after 20 minutes of inactivity. A private City desktop has a maximum 20-minute lease. Container restart clears conversations, City authentication and private evidence. Download an official receipt promptly. A durable ledger retains only hashed submission markers and daily usage counts, so a restart does not authorize blindly retrying an uncertain submission.

`KEEP_AWAKE_UNTIL` matches the extended November 3 launch deadline. Cloudflare alarms renew a two-hour idle timeout hourly, without calling the AI or opening City browser sessions. At the deadline the normal two-minute idle timeout resumes automatically; the application remains available on request afterward. No container is forcibly stopped at the deadline. Server failures or deployments may still require a restart. Outside the launch window, the container sleeps after two minutes without requests and may take time to wake. Visible booking polling keeps an active booking session awake. No personal development profile, City cookies or local receipt directory is deployed.

## Booking boundary

Residents control the actual City browser inside chat for login, MFA and legal declarations. Toronto One relays browser pixels and input through its server; credentials are not logged or provided to the AI. Password-manager autofill and assistive technology inside the remote pixel view may be limited. Security challenges remain resident-controlled.

Activity submission remains limited to the reviewed zero-dollar enrollment path. The tennis preview uses a separate resident-controlled facility checkout: it validates a maximum total (default $0), binds an exact cart review and journals the handoff before the resident personally completes legal approvals and payment. Confirmation requires matching official permit and City account evidence. Signed-in tennis preparation and the unpaid payment screen have been verified; completed permit/account matching still requires live validation. Other paid transaction adapters, cancellation and continuous background tracking are unsupported. The public preview must not label an unverified reservation as confirmed.
