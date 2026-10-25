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

The canonical Wrangler config also references a prebuilt image, so directly invoking Wrangler cannot trigger a local Docker build. Use `pnpm run deploy` for source updates; a bare Wrangler deployment only selects the already configured image. Keep Docker Desktop off. The Dockerfile and `pnpm check:ci` are for the remote runner; do not run the production check/build locally.

## Preview limits

The default limits are 50 model turns per UTC day across visitors, 12 turns per visit, two concurrent model runs, four active visitor sessions and two private City browsers. A model turn has a three-minute budget and bounded tool steps. Failed turns also consume quota. These are usage bounds, not an exact dollar spending cap. Gateway usage should be reviewed separately.

Conversations and results expire after 20 minutes of inactivity. A private City desktop has a maximum 20-minute lease. Container restart clears conversations, City authentication and private evidence. Download an official receipt promptly. A durable ledger retains only hashed submission markers and daily usage counts, so a restart does not authorize blindly retrying an uncertain submission.

The container is kept awake until November 1, 2026 at 4:40 a.m. Toronto time (`KEEP_AWAKE_UNTIL`). Cloudflare alarms renew a two-hour idle timeout hourly, without calling the AI or opening City browser sessions. At the deadline the normal two-minute idle timeout resumes automatically. Server failures or deployments may still require a restart. Outside that review window, the container sleeps after two minutes without requests and may take time to wake. Visible booking polling keeps an active booking session awake. No personal development profile, City cookies or local receipt directory is deployed.

## Booking boundary

Residents control the actual City browser inside chat for login, MFA and legal declarations. Toronto One relays browser pixels and input through its server; credentials are not logged or provided to the AI. Password-manager autofill and assistive technology inside the remote pixel view may be limited. Security challenges remain resident-controlled.

Only the reviewed zero-dollar reservation path is supported. Exact checkout approval is required, and confirmation requires matching official receipt and enrollment evidence. Paid checkout, cancellation and continuous background tracking are unsupported. The public preview must not label an unverified reservation as confirmed.
