# Design system

Toronto One uses Next.js, shadcn/Radix and Lucide. A centered raccoon companion, readable conversation and contextual actions form the main experience. Chat, Tasks and Settings share the same navigation and semantic styling.

## Tokens and typography

`src/app/globals.css` is the source of truth. `@theme inline` exposes semantic tokens to Tailwind. Use paired foreground/surface tokens and shared geometry rather than isolated colour or spacing values.

| Role                             | Implementation                           |
| -------------------------------- | ---------------------------------------- |
| Headings                         | Local Instrument Sans variable font      |
| Body and controls                | Local Inter variable font                |
| Light canvas / text              | `#FCFBF9` / `#202124`                    |
| Dark canvas / text               | `#111216` / `#F1F3F7`                    |
| Primary action                   | Blue `#0057E7`; dark theme `#87B7FF`     |
| Resident message                 | Blue with white text                     |
| Agent message                    | Neutral surface with readable foreground |
| Minimum control target           | 44 CSS pixels                            |
| Card / sheet / composer geometry | Shared radius and spacing variables      |

Local font licences are retained beside the font files. Light, dark and system appearance are supported. Reduced-motion and reduced-transparency preferences are respected.

## Brand wordmark

The approved mark is the outlined, stacked **TORONTO / ONE** wordmark from Figma’s **FINAL DIRECTION** frame. `public/brand/toronto-one-wordmark.svg` is the production master; its paths preserve the final letterforms, aligned lower line and refined spacing. `BrandLogo` supplies its accessible name and shares the artwork between the mobile header (90px wide, about 32px high) and desktop sidebar (156px wide). Preserve its aspect ratio and the surrounding layout space. Dark appearance inverts the black artwork to white without a client-side image swap.

The browser icon uses the same complete wordmark in `toronto-one-favicon.svg`, with a browser-colour-scheme treatment. The 180px Apple touch icon places it on the light canvas in `toronto-one-apple-touch.png`. The previous Wide lens symbol is retired. The animated raccoon remains the activity companion.

## Landing page

The application root presents the landing page; **Start chat** enters `/chat`. Production retains the `/toronto-one` prefix for both routes. The landing uses scoped, light-only styles with the existing local Instrument Sans and Inter fonts, Toronto blue and the light paper canvas. It does not change the concierge's light, dark or system appearance preference.

The hero pairs closely grouped copy with the supplied wide Toronto skyline postcard and a sharp static render of the original mascot, retaining its native Blender fur, materials and lighting. Transparent responsive WebP assets preserve the rendered appearance without live 3D or an undersized animated loop. The concierge's seven activity animations remain unchanged. The subtitle invites visitors to find their next Toronto activity. The service field contains 60 static emoji labels; Recreation appears first with the soft blue ✅ highlight. Voting is an ordinary, unhighlighted label within the wider City-service vision. Service labels have no click or hover behavior. Navigation links retain visible focus and at least 44px targets.

The chat welcome features **Find basketball near me** and **Help me choose an activity**, followed by the existing tennis starter. Both discovery starters ask one inline question at a time and use actual City listings without preparing a booking. Voting has no welcome starter; direct election questions retain the existing lookup and post-election recovery behavior.

## Components

- **ConversationComposer:** growing input capsule, editable draft during agent work and distinct send/stop actions. Mobile Return inserts a newline. Stop applies to conversation generation, not an already submitted City transaction.
- **MessageBubble:** aligned resident/agent messages, readable text, escaped content and keyboard-reachable copy actions. Reading older messages does not force a jump to the latest response.
- **ResidentInput:** inline text, number and date controls, optional choice buttons and a free answer alongside choices. Only the current question is interactive; age and day questions remain actionable even when emitted as a short ordinary question. Labels, visible focus and 44px inputs/targets are preserved. Sensitive account, legal and payment steps stay in the private City workflow.
- **LookupRecovery:** a contextual explanation with fixed official-source links and, when appropriate, a public-information-only retry. Post-election redirects and verification challenges offer an official source without a retry button. An earlier tool error followed by a published result is labelled Lookup recovered; its diagnostic detail remains available.
- **CityResultCard:** compact voting or recreation facts and one contextual action. Chat cards share the reply's source disclosure; Tasks retain their own disclosure.
- **Voting location input:** defaults to an intersection, with an optional street-address mode. The lookup button submits directly, with no separate checkbox. Voting cards use a plain Nearby address disclosure, one visible assignment limitation, a prominent venue name and labelled rows for date, hours and entrances. Facility records and distances sit inside the disclosure. The Google Maps widget is 240px tall on mobile and 280px on desktop, with an external map link.
- **SourceDisclosure:** one quiet, collapsed native disclosure beneath a reply: **Sources · N**, or **Pages checked · N** when no supporting excerpts were selected. Each expanded source shows only a link, compact Toronto-local check time and one supporting excerpt preview, limited to three visible lines. Full observed title/URL and full date/timezone remain available through the link and timestamp titles; the timestamp also has an accessible check-time label. The preview and timestamp come from the same observation. Counts represent unique pages, and complete citation evidence stays in session/result metadata. Summary and link targets are at least 44px, with visible keyboard focus and reduced-motion support.
- **Tennis request and review:** a source-verified court card opens a date/time, group-size and maximum-total form. The maximum starts at $0. Native labelled controls have 44px targets, semantic theme tokens and keyboard focus. The private City browser handles participant/slot selection, legal declarations, signatures and payment. The app shows the exact verified cart total before handoff and labels a permit confirmed only after official document/account matching. Court requests and permit downloads appear in Tasks.
- **AgentActivity:** real pending tool progress, errors and booking activity. Completed public-browser steps are represented by the source disclosure rather than a redundant click history or step count.
- **BottomSheet:** shadcn/Radix focus management, accessible title, scrollable content, reachable action footer and downward handle dismissal. Closing a booking review resets its local approval control.
- **AgentMascot:** seven explicit activity states: `idle`, `listening`, `thinking`, `working`, `success`, `needs_input` and `error`. Transparent Blender-rendered WebP frames use bounded canvas playback, visibility suspension, reduced-motion stills and image-failure fallback. This is rendered animation, not a live WebGL scene.

Domain-neutral primitives belong in `src/components/ui`; concierge-specific components belong in `src/components/concierge`.

## Responsive and accessible behavior

The application uses one main content scroller. Safe-area insets and visual-viewport handling keep the composer visible when a mobile keyboard changes height. Navigation hides while typing, tabs retain reading position and review sheets preserve conversation context. Pinch zoom remains enabled.

At widths of 960px and above, a persistent 248px sidebar contains the brand, Chat and Tasks, with Settings anchored at the bottom. The conversation and composer remain centered in the main area. Below that breakpoint, the header settings control and bottom Chat/Tasks navigation remain in place.

Preserve visible focus, meaningful labels, keyboard access, readable decision details and touch targets. Pending or uncertain states must remain visually distinct from confirmed results. Accessibility conformance requires testing of complete flows; primitives and token choices alone do not establish it.
