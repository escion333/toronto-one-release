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

## Components

- **ConversationComposer:** growing input capsule, editable draft during agent work and distinct send/stop actions. Mobile Return inserts a newline. Stop applies to conversation generation, not an already submitted City transaction.
- **MessageBubble:** aligned resident/agent messages, readable text, escaped content and keyboard-reachable copy actions. Reading older messages does not force a jump to the latest response.
- **CityResultCard:** compact voting or recreation facts, one contextual action and a source disclosure with exact excerpts and check times.
- **AgentActivity:** real tool progress with labels appropriate to the operation.
- **BottomSheet:** shadcn/Radix focus management, accessible title, scrollable content, reachable action footer and downward handle dismissal. Closing a booking review resets its local approval control.
- **AgentMascot:** seven explicit activity states: `idle`, `listening`, `thinking`, `working`, `success`, `needs_input` and `error`. Transparent Blender-rendered WebP frames use bounded canvas playback, visibility suspension, reduced-motion stills and image-failure fallback. This is rendered animation, not a live WebGL scene.

Domain-neutral primitives belong in `src/components/ui`; concierge-specific components belong in `src/components/concierge`.

## Responsive and accessible behavior

The application uses one main content scroller. Safe-area insets and visual-viewport handling keep the composer visible when a mobile keyboard changes height. Navigation hides while typing, tabs retain reading position and review sheets preserve conversation context. Pinch zoom remains enabled.

At widths of 960px and above, a persistent 248px sidebar contains the brand, Chat and Tasks, with Settings anchored at the bottom. The conversation and composer remain centered in the main area. Below that breakpoint, the header settings control and bottom Chat/Tasks navigation remain in place.

Preserve visible focus, meaningful labels, keyboard access, readable decision details and touch targets. Pending or uncertain states must remain visually distinct from confirmed results. Accessibility conformance requires testing of complete flows; primitives and token choices alone do not establish it.
