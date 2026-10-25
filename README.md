# Toronto One

[Open Toronto One](https://www.tomsanee.com/toronto-one)

An AI concierge for City of Toronto voting information and recreation reservations. Residents converse with a raccoon companion, see real tool progress and receive results linked to official sources. Toronto One is independent from the City of Toronto.

The application uses Next.js, React, shadcn/ui, AI SDK 7, Vercel AI Gateway and Playwright. The default model is configurable GPT-6.1 Sol. It has no simulated chatbot or booking fallback.

The integrated light-only landing page uses [www.tomsanee.com/toronto-one](https://www.tomsanee.com/toronto-one) as its production entry, with **Start chat** opening [/toronto-one/chat](https://www.tomsanee.com/toronto-one/chat). Locally without a base path, these routes are `/` and `/chat`. The landing preserves the original native-groom mascot as a static, responsive WebP render; the concierge retains its activity animation and light, dark and system appearance settings. See [validation](docs/VALIDATION.md) for deployment status.

## Capabilities

- **Voting:** municipal voting-place information from MyVote using a street address, or a nearby public example address selected from City data for an intersection. Example results clearly distinguish the public address from the resident's assignment. Voting cards include a Google Maps venue widget. It does not determine eligibility or check voter registration.
- **Recreation:** live activity discovery, official guidance across recreation service families, a reviewed zero-dollar activity enrollment adapter, and a tennis court reservation preview. Tennis requests use the City’s dedicated court schedule, a resident-selected maximum total (default $0), private City checkout and matching official permit/account evidence. Residents select their City participant and slot, personally handle declarations, signatures and payment, and return for verification. The signed-in tennis flow has been verified through the unpaid payment screen; completed permit verification remains unverified. See [validation](docs/VALIDATION.md).
- **Tasks:** sourced findings and verified booking receipts within a temporary local session.
- **Companion:** seven animation states driven by actual agent activity, using transparent frames rendered from a Blender character, with reduced-motion and static fallbacks.

The hosted configuration uses a Cloudflare Worker and one container. It supports isolated anonymous visits, inline interactive questions, conversation restoration and a resident-controlled private City browser. Activity enrollment stops at nonzero totals. Tennis checkout is resident-controlled and stops when the verified total exceeds the chosen maximum; unsupported portal requirements stop for attention. This is a bounded public preview, with temporary sessions rather than durable background tracking.

## Run locally

Use Node.js 24 LTS and pnpm 10.34.8. The declared Node.js range also permits Node.js 26.

```sh
corepack pnpm@10.34.8 install --frozen-lockfile
corepack pnpm@10.34.8 browser:install
cp .env.example .env.local
```

Configure the ignored `.env.local` file:

```dotenv
AI_GATEWAY_API_KEY=your_gateway_key
AI_GATEWAY_MODEL=openai/gpt-6.1-sol
```

The selected model requires valid Vercel AI Gateway credentials and account access, including any required credits. A ChatGPT subscription does not provide API credentials. Keys remain server-side; never put them in `NEXT_PUBLIC_*` variables. Restart the application after changing environment configuration.

```sh
corepack pnpm@10.34.8 dev --hostname 127.0.0.1 --port 3000
```

Open [Toronto One](http://127.0.0.1:3000) and choose **Start chat**, or open the [concierge directly](http://127.0.0.1:3000/chat). Ask where to vote or request a recreation activity. For booking, use the separate City browser window for authentication and legal declarations. Review the participant, session and amount before approving a real reservation. A zero-dollar online reservation can still have a disclosed check-in fee.

## Privacy and execution

Public conversations and findings use isolated, temporary server sessions. Findings survive a page refresh but expire after inactivity or process restart. A verified booking checkpoint can restore its receipt view for the original session cookie for up to 20 minutes, without restoring City credentials or permission to submit again. Conversation text is restored after refresh while the session remains active. Resident content and approvals are not stored in browser local storage.

Private receipt evidence and write-safety journals are saved under ignored `.local/booking` with restrictive permissions. Clearing the session removes its checkpoint and browser session; it does not delete those evidence or journal files. These records can contain personal information and must remain outside version control and deployment artifacts.

The model selects bounded public tools. Application code validates evidence, enforces checkout approval, records an outbound intent before submission and matches the official receipt against the City account. An unknown submission outcome requires reconciliation, never a blind retry. Stopping a conversation does not cancel an already submitted City transaction.

## Checks

```sh
corepack pnpm@10.34.8 check
node scripts/verify-browser.mts
# Requires a running local app and billable model access:
corepack pnpm@10.34.8 test:live
```

`check` runs formatting, lint, route generation, strict TypeScript, tests and a production build. The browser and live-model scripts exercise public lookups; they do not submit reservations. Never use an unattended test to make a real City reservation.

`dev` uses the normal Next.js development server. `dev:server` and `start` use the custom server. Hosted Linux builds enable the private City browser; local Mac development uses a separate City browser window. See [Hosting](docs/HOSTING.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Service capabilities and limits](docs/SERVICES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Validation](docs/VALIDATION.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

No project-wide source licence is currently granted. Bundled third-party notices remain applicable.

## Deployment

Use `pnpm run deploy` after committing and pushing intended changes. `pnpm check` runs remote checks and builds without deploying. Checks and the image build run on GitHub; Docker stays off locally. See [Hosting](docs/HOSTING.md).
