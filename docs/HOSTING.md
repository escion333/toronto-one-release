# Hosting

Toronto One is configured for `https://www.tomsanee.com/toronto-one`. The apex domain redirects to www. Existing portfolio paths remain on their current host.

## Runtime

Cloudflare Workers Paid and Containers run the custom Next.js server, streaming AI responses and private browser WebSockets. `deploy/cloudflare/wrangler.jsonc` defines the routes and container image. Docker build input excludes environment files, private runtime data and Git history.

Install these Worker secrets through Wrangler or the Cloudflare dashboard: `AI_GATEWAY_API_KEY` and a random, independently generated `PRIVATE_STORE_TOKEN`. Never commit values or expose them through `NEXT_PUBLIC_*`. The Worker passes runtime secrets only to the server; resident Chromium receives a restricted environment.

```sh
corepack pnpm@10.34.8 exec wrangler deploy --config deploy/cloudflare/wrangler.jsonc
```

## Remote image builds

`.github/workflows/build-image.yml` builds the Linux image on a GitHub-hosted runner and pushes it to Cloudflare’s private registry. Docker does not need to run on the developer’s computer. The workflow runs on the `codex/ui-remote-release` branch or by manual dispatch when available on the default branch.

Supply `CF_UI_REGISTRY_USER` and `CF_UI_REGISTRY_PASSWORD` as repository Actions secrets using short-lived Cloudflare registry credentials. Remove these secrets after a one-off release. Application secrets stay in the existing Cloudflare runtime and are never provided to the image build.

After the remote build succeeds, use its immutable registry digest as `containers[0].images.base` in a private deployment config next to the canonical Wrangler config. Deploying that registry reference uploads only the Worker and image selection; it does not invoke local Docker. Verify the public health endpoint’s configured and running image digests and the changed interface after rollout.

## Preview limits

The default limits are 50 model turns per UTC day across visitors, 12 turns per visit, two concurrent model runs, four active visitor sessions and two private City browsers. A model turn has a three-minute budget and bounded tool steps. Failed turns also consume quota. These are usage bounds, not an exact dollar spending cap. Gateway usage should be reviewed separately.

Conversations and results expire after 20 minutes of inactivity. A private City desktop has a maximum 20-minute lease. Container restart clears conversations, City authentication and private evidence. Download an official receipt promptly. A durable ledger retains only hashed submission markers and daily usage counts, so a restart does not authorize blindly retrying an uncertain submission.

The container is kept awake until November 1, 2026 at 4:40 a.m. Toronto time (`KEEP_AWAKE_UNTIL`). Cloudflare alarms renew a two-hour idle timeout hourly, without calling the AI or opening City browser sessions. At the deadline the normal two-minute idle timeout resumes automatically. Server failures or deployments may still require a restart. Outside that review window, the container sleeps after two minutes without requests and may take time to wake. Visible booking polling keeps an active booking session awake. No personal development profile, City cookies or local receipt directory is deployed.

## Booking boundary

Residents control the actual City browser inside chat for login, MFA and legal declarations. Toronto One relays browser pixels and input through its server; credentials are not logged or provided to the AI. Password-manager autofill and assistive technology inside the remote pixel view may be limited. Security challenges remain resident-controlled.

Only the reviewed zero-dollar reservation path is supported. Exact checkout approval is required, and confirmation requires matching official receipt and enrollment evidence. Paid checkout, cancellation and continuous background tracking are unsupported. The public preview must not label an unverified reservation as confirmed.
