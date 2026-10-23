# Approved UI refinement 2 — S2-D2-F02 Conversation Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Source:** Developer 2 feedback and screenshots 3–4 supplied on 2026-10-17  
**Visual review:** [Static UI mockup](../S2-D2-F01/help-request-chat-ui-round2-review.html)  
**Approval reference:** Developer 2 replied “Approve. Make the necessary planned improvements” to the two draft refinements and mockup. The approved pre-metadata F02 draft has SHA-256 `F09DA39D1D30FDAEB991AD5DC790F1BF819350153A358F6C858F18BAC3F80E21`; its exact bytes are retained in `Dev2-local-SDD-backups/2026-10-17-ui-refinement-round2-approved/`.

This approved refinement adds to the F02 PRD, TDD, Requirements-to-Tests (RTT), and first UI amendment. Existing ownership, authorization, message ordering, delivery status, paging, and retry behavior remain in force.

## Approved product requirements

| ID | Requirement |
| --- | --- |
| F02-UI-04 | Conversation detail has no visible **Message** label beside the composer. The **Write a message…** placeholder provides the visual hint, while the textarea retains a programmatic accessible name. The icon-only send control retains **Send message** as its accessible name. The composer still grows and wraps as specified in F02-UI-02. |
| F02-UI-05 | On desktop, the conversation detail uses the available main content area beside the left navigation bar, with comfortable edge padding, rather than a narrow centered 1050 px column. Its chat surface occupies the practical remaining viewport height below the top bar and page heading, with message history taking flexible space and composer attached below. On smaller screens, it adapts to the shell/mobile navigation and on-screen keyboard without obscuring messages, status, paging, or composer controls. No horizontal page scrolling. |
| F02-UI-06 | Each row on the **Conversations** list has clearly separated information: a labelled request title, labelled participant, labelled module, and a prominent **Open conversation** button within that row. The button identifies and opens the corresponding authorized conversation. Labels remain visible at desktop and 320 px widths; long titles and names wrap. List loading, empty, unavailable, denied, and retry states remain distinguishable. |

## Approved technical design additions

- Remove the visible composer label from layout while retaining `aria-label` or a reliably visually hidden label for screen readers. Confirm the selected hiding technique actually hides it in the shipped stylesheet. Do not rely on the placeholder as the accessible name.
- Scope the full-width/full-height treatment to conversation detail so other pages keep their existing layout. Reconcile the `.chat-page` width cap and `.main-content` maximum width; use a detail-specific class or shell modifier. Use flex/grid sizing and viewport-aware minimum height rather than a fixed history height. Account for top bar, page heading, shell padding, safe areas, and mobile navigation. Maintain scroll anchoring, paging, live updates, and textarea growth.
- Structure each list card with a title, labelled metadata (definition-list semantics where practical), and a separate action footer or right-aligned action zone. Use the existing route and button conventions. A card title is content, not the only click target. Keep one clear action per card and a visible focus state.
- Preserve authorization and privacy of participant/request data; this refinement needs no new fields or API changes.

## Approved verification additions

| ID | Verification scenario | Required observation |
| --- | --- | --- |
| F02-UI-TC-04 | Inspect the composer visually and with keyboard/screen reader at desktop and 320 px; type multiline and long text. | No visible Message label; textarea and send icon have accessible names; input still expands, wraps, and stays usable. |
| F02-UI-TC-05 | Inspect desktop conversation detail at common laptop and wide-screen sizes, then mobile/short viewport with on-screen keyboard; exercise history paging, status, and growing composer. | Chat occupies the available shell area beside navigation with proper padding and flexible history; controls are not clipped or covered; no horizontal page scrolling. |
| F02-UI-TC-06 | Inspect one and several conversation cards at desktop and 320 px; use keyboard to activate each Open conversation button; inspect loading, empty, and error states. | Labelled request title, participant, and module are visually distinct and wrap; each card has a prominent button that opens only its own authorized conversation; focus and non-ready states remain clear. |

**Scope:** This approval authorizes the three UI requirements above. It does not authorize changes to conversation data contracts, persistence, authorization, deployment, or release.
