# Draft UI amendment — S2-D2-F02 Conversation Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Scope:** Student and Mentor conversation detail presentation and message composer  
**Source:** Developer 2 feedback and screenshot 5 supplied on 2026-10-17  
**Visual review:** [Static UI mockup](../S2-D2-F01/help-request-chat-ui-review.html)

This approved amendment adds to the F02 PRD, TDD, and Requirements-to-Tests. The existing approved artifacts remain the baseline. Conversation ownership, message persistence, ordering, receipts, retries, and authorization remain governed by the existing specifications.

## Approved product requirement additions

| ID | Requirement | Existing coverage strengthened |
| --- | --- | --- |
| F02-UI-01 | Conversation detail uses a recognizable chat layout: compact request/participant context at the top, a visually dominant scrollable message history, and a composer immediately below that history. Incoming and outgoing messages have distinct alignment and bubble styling. The request description remains available without consuming the main chat area. Empty, loading, stale, denied, and retry states fit this layout without looking like posts in a forum. | FR-07–FR-09/FR-22–FR-23, NFR-06–NFR-07, AC-16/AC-18/AC-42 |
| F02-UI-02 | The composer uses a multiline text field that occupies the available row width beside an icon-only send control, with comfortable inner padding. The send control has an accessible name, **Send message**, visible focus, and at least a 44×44 px target. The text field starts compact, expands vertically as lines are entered up to a bounded height, and then scrolls vertically. Text and long unbroken strings wrap; neither the composer nor message bubbles require horizontal scrolling. Newlines remain available for multiline messages. | FR-10/FR-22–FR-23, NFR-06–NFR-07, AC-24–AC-25/AC-42 |
| F02-UI-03 | At laptop and 320 px widths, the chat panel uses the available content width with responsive padding. The composer stays visually attached to the conversation, and history/paging/status controls remain accessible as it grows. The input is not a large fixed-height blank area. Existing Sending/Sent/Read/uncertain/failure semantics and keyboard behavior remain accurate. | FR-19/FR-22–FR-23, NFR-06–NFR-07, AC-18/AC-31/AC-34/AC-42 |

## Approved technical design additions

- Keep request context as a compact header or disclosure above the history. Keep title, other participant, module, and full question accessible; use the already authorized parent data.
- Give the conversation a bounded viewport so message history is the main panel. Keep existing history paging, scroll-anchor behavior, message order, live updates, status text, and receipt handling. Distinguish own and other messages through alignment, color, and semantic context rather than color alone.
- Lay out the composer as a flexible row. The textarea uses `min-width: 0`, `box-sizing: border-box`, `white-space: pre-wrap`, and wrapping/overflow rules appropriate for long content. Grow it from one visual line to a documented maximum such as six lines, then use vertical overflow. Reset its visual height after a confirmed send or when cleared; preserve text/height appropriately through uncertain sends.
- Use an existing icon system or a small local send glyph within the button; provide `aria-label="Send message"` and keep disabled/loading states distinguishable. Preserve normal textarea newline entry; do not silently change keyboard send behavior in this UI revision.
- Verify the 320 px layout with long words, multiline Unicode, browser zoom, and the on-screen keyboard. Avoid fixed positioning that covers messages or recovery controls.

## Approved verification additions

| ID | Verification scenario | Required observation |
| --- | --- | --- |
| F02-UI-TC-01 | Open Student and Mentor chats with context, incoming/outgoing messages, paging, and empty/stale/denied states at laptop and 320 px. | Message history is the primary chat surface, direction is clear without relying only on color, context remains available, and recovery controls stay usable. |
| F02-UI-TC-02 | Type one line, many lines beyond the height cap, embedded newlines, and long unbroken text in the composer; inspect at 320 px and zoom. | Input fills available row width, grows then scrolls vertically, preserves line breaks, wraps text, and causes no horizontal page or field scroll. |
| F02-UI-TC-03 | Navigate by keyboard/screen reader to the send icon; inspect sending, uncertain, failed, and sent states. | The icon control is labelled Send message, has visible focus and touch target, invokes the same send/retry rules, and status feedback remains perceivable. |

**Approval reference:** Developer 2 replied “approve. Make the necessary changes based on the HTML mockup” on 2026-10-17. This amendment authorizes the UI changes specified above; it does not claim implementation, verification, merge, or release.
