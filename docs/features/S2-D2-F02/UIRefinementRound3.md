# Approved UI refinement 3 — S2-D2-F02 Conversation Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Source:** Developer 2 feedback and screenshot 2 supplied on 2026-10-17  
**Visual review:** [Conversation detail static HTML mockup](conversation-detail-fullscreen-round3-review.html)  
**Approval reference:** Developer 2 replied “approve. Make the changes” to the round-3 F01/F02 drafts and conversation mockup. The approved pre-metadata F02 draft has SHA-256 `D6181A75C7A667F33043E831C42111AA601C3F01249E135839039DE4A090691E`; exact bytes are retained in `Dev2-local-SDD-backups/2026-10-17-ui-refinement-round3-approved/`.

This approved refinement adds to F02-UI-05 and the F02 PRD, TDD, and Requirements-to-Tests. Conversation ownership, messages, receipts, paging, retries, and authorization remain governed by the approved F02 package.

## Approved product requirements

| ID | Requirement |
| --- | --- |
| F02-UI-07 | On Conversation detail, remove the separate large **Conversation** page heading. Put the **Back to conversations** control inside the chat window header beside the other participant and request/module context. The back control is visually recognizable, keyboard reachable, and has an accessible name at every width. The request-context disclosure remains available in this header or directly below it. |
| F02-UI-08 | At desktop widths, the conversation window occupies the full viewport region immediately to the right of the left navigation bar: no route-specific top bar above it and no outer content gutters or framed card margins. The chat header, flexible message history, and composer form one edge-to-edge vertical surface. History alone scrolls during ordinary use; composer and header remain available. The viewport and browser zoom must not clip paging, status, recovery, or send controls. At mobile widths, the chat takes the available viewport while respecting any persistent mobile navigation, safe areas, and on-screen keyboard. Other routes keep their existing shell layout. |

## Approved technical design additions

- Apply a conversation-detail-only shell mode to remove the shared top bar and main-content width/padding for this route. Do not hide the top bar on the conversation list or other Student/Mentor routes. Avoid relying on a decorative page heading to identify the active chat; the participant and request context provide that identification.
- Put a routed back link in the chat header before the participant/context block. Preserve a clear focus indicator and an accessible full label even if narrow layouts show only an arrow icon. Keep the existing request-context disclosure semantics, authorized data, and plain-text rendering.
- Size the chat surface to the remaining viewport with a flex/grid column: fixed-content header and composer, flexible `min-height: 0` scrollable history. Account for desktop sidebar width, mobile navigation, dynamic viewport height, safe-area insets, and a growing composer. Allow document scrolling as a fallback on very short viewports rather than covering controls.
- Keep message alignment, timestamps, Sending/Sent/Read/uncertain states, history paging/scroll anchoring, textarea growth/wrapping, and send behavior unchanged.

## Approved verification additions

| ID | Verification scenario | Required observation |
| --- | --- |
| F02-UI-TC-07 | Open Student and Mentor conversation detail at laptop and wide desktop widths; inspect header and navigate back with pointer, keyboard, and screen reader. | No separate large Conversation heading; the back control is within the chat header, visibly actionable, named accessibly, and returns to the role's conversation list. Participant, module, title and request context remain available. |
| F02-UI-TC-08 | Inspect at 320 px, short viewport, zoom and mobile keyboard, with long messages, paging, status/retry controls, and a growing composer. | Desktop chat fills the region beside the sidebar without outer top/side/bottom gutters; on small screens it adapts without horizontal scrolling, covered controls, or lost focus. Header and composer stay available while history scrolls. |

**Scope:** This approval authorizes the detail-page shell and header changes above. It does not change conversation data contracts, persistence, authorization, deployment, or release. The HTML is a visual proposal rather than a functioning conversation.
