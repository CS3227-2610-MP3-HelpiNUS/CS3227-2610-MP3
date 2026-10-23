# Draft UI amendment — S2-D2-F01 Help Request Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Scope:** Student request detail, Mentor pending/decided cards and detail, decision confirmation  
**Source:** Developer 2 feedback and screenshots 1–4 supplied on 2026-10-17  
**Visual review:** [Static UI mockup](help-request-chat-ui-review.html)

This approved amendment adds to the F01 PRD, TDD, and Requirements-to-Tests. The existing approved artifacts remain the baseline. The request lifecycle, role authorization, accepted-conversation integrity, data fields, and existing acceptance criteria remain in force.

## Approved product requirement additions

| ID | Requirement | Existing coverage strengthened |
| --- | --- | --- |
| F01-UI-01 | Student and Mentor detail pages present the request title and status in a clear header; a labelled **Request information** area contains role-appropriate participant name, module, and submitted/decided times; a distinct **Question** area contains the full description. Pending Mentor decisions occupy a separate action area. Labels must remain visible at laptop and 320 px widths, and long titles/descriptions must wrap without horizontal page scrolling. Preserve the existing historical-module fallback, plain-text rendering, and participant privacy. | FR-06–FR-07, NFR-03–NFR-04/NFR-07, AC-12–AC-13/AC-18/AC-42/AC-45 |
| F01-UI-02 | Each Mentor pending and decided request card provides a clearly labelled **View details** control inside that card. The title is displayed as text and is not the only route to detail. The control opens the matching authorized detail; it remains visually apparent and keyboard reachable in both columns and in the stacked mobile layout. | FR-07, NFR-03–NFR-04/NFR-07, AC-17–AC-20/AC-42/AC-45 |
| F01-UI-03 | Choosing **Accept** opens a modal confirmation above the detail page, rather than adding a segment below the request card. The dialog names the decision and identifies the request with its title and Student display name; **Accept request** confirms and **Cancel** closes it without a decision. Rejection uses the same modal pattern for consistency. The underlying detail stays visible but inert while the dialog is open. Focus enters the dialog, remains there while open, and returns to the initiating button on cancellation/close. Escape closes an idle dialog. During a pending decision, duplicate submission is blocked and the existing checking/uncertain/conflict feedback remains truthful. | FR-08/FR-11, NFR-02–NFR-04/NFR-07, AC-21–AC-24/AC-32–AC-36/AC-42/AC-45 |

## Approved technical design additions

- Render both role details from one structured layout: heading/status, definition-list style metadata, question section, and an action footer where applicable. Use the current authorized request fields; do not add a database field or cross-user lookup. Preserve whitespace/newlines in description and wrap long content.
- Place a `View details` link or button in every Mentor card with its own accessible name and route. Keep queue ordering, status, and loading/error behavior unchanged. The title may remain plain text rather than a competing hidden action.
- Replace the inline `help-confirm` block with an accessible modal dialog. Keep the existing selected decision and operation ID reconciliation logic; opening the dialog performs no write. Confirm invokes the existing decision path exactly once. Cancel/close resets only the unsent selection; an uncertain already-sent result must retain its operation identity and recovery path.
- Use the existing HelpiNUS colors, button styles, status pills, spacing, and focus conventions. Stack metadata and actions on narrow screens. Do not obscure validation, decision state, or the conversation link.

## Approved verification additions

| ID | Verification scenario | Required observation |
| --- | --- | --- |
| F01-UI-TC-01 | Open Student and Mentor pending/decided detail with long title, multiline description, historical module fallback and decision time; inspect at laptop and 320 px. | Header/status, labelled metadata, and question remain distinct and readable; no clipped fields or horizontal page scroll; authorized data and fallback are unchanged. |
| F01-UI-TC-02 | Inspect Mentor pending and decided cards with keyboard and pointer; activate each card's View details control. | Every card has a visible control inside it, focus is visible, and each opens its own authorized detail. Title alone is not required for navigation. |
| F01-UI-TC-03 | Open Accept and Reject dialogs, cancel by button and Escape, then confirm; repeat under slow, uncertain, and terminal-conflict responses. Check keyboard and screen reader. | Confirmation appears as a modal overlay, page behind it is inert, focus is contained and restored, cancellation makes no call, confirmation makes one intended call, and existing outcome/retry messaging stays truthful. |

**Approval reference:** Developer 2 replied “approve. Make the necessary changes based on the HTML mockup” on 2026-10-17. This amendment authorizes the UI changes specified above; it does not claim implementation, verification, merge, or release.
