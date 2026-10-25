# Toronto One

A local AI concierge for City of Toronto voting information and recreation reservations. Residents converse with a raccoon companion, see real tool progress and receive results linked to official sources. Toronto One is independent from the City of Toronto.

The application uses Next.js, React, shadcn/ui, AI SDK 7, Vercel AI Gateway and Playwright. The default model is configurable GPT-6.1 Sol. It has no simulated chatbot or booking fallback.

## Capabilities

- **Voting:** address-specific municipal voting-place information from MyVote. It does not determine eligibility or check voter registration.
- **Recreation:** live activity discovery and a reviewed, authenticated zero-dollar reservation flow. Residents sign in directly with the City, choose a participant, accept waivers themselves and approve the exact checkout before submission.
- **Tasks:** sourced findings and verified booking receipts within a temporary local session.
- **Companion:** seven animation states driven by actual agent activity, using transparent frames rendered from a Blender character, with reduced-motion and static fallbacks.

The validated usage is a single-user local demonstration. It has no production authentication, database or background tracking. Nonzero checkout totals and unsupported portal requirements stop for attention. Optional custom-server, URL-prefix and remote-browser plumbing is included. Remote City browsing is disabled by default, is not connected to the interface and is not deployment-ready.

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

Open [Toronto One](http://127.0.0.1:3000). Ask where to vote or request a recreation activity. For booking, use the separate City browser window for authentication and legal declarations. Review the participant, session and amount before approving a real reservation. A zero-dollar online reservation can still have a disclosed check-in fee.

## Privacy and execution

Public conversations and findings use isolated, temporary server sessions. Findings survive a page refresh but expire after inactivity or process restart. A verified booking checkpoint can restore its receipt view for the original session cookie for up to 20 minutes, without restoring City credentials or permission to submit again. Conversation text is not restored in the interface after refresh. Resident content and approvals are not stored in browser local storage.

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

`dev` uses the normal Next.js development server. `dev:server` and `start` use the optional custom server; its remote-browser path has not been validated at runtime and is not a supported deployment workflow.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Service capabilities and limits](docs/SERVICES.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Validation](docs/VALIDATION.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

No project-wide licence is currently granted. Bundled third-party notices remain applicable; redistribution terms for project code and visual assets must be resolved before a public release.
