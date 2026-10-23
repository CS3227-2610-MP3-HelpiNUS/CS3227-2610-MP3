# Approved UI refinement 3 — S2-D2-F01 Help Request Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Source:** Developer 2 feedback and screenshot 1 supplied on 2026-10-17  
**Visual reference:** [Previously approved round-2 mockup, centered dialog](help-request-chat-ui-round2-review.html#entry)  
**Approval reference:** Developer 2 replied “approve. Make the changes” to the round-3 F01/F02 drafts and conversation mockup. The approved pre-metadata F01 draft has SHA-256 `22F649E6B038207F6891BF53E6025C226E8892FCA8271540EE9093AE44B44E60`; exact bytes are retained in `Dev2-local-SDD-backups/2026-10-17-ui-refinement-round3-approved/`.

This approved refinement adds to F01-UI-04 and the F01 PRD, TDD, and Requirements-to-Tests. Request creation and navigation behavior are outside this visual change.

## Approved product requirement

| ID | Requirement |
| --- | --- |
| F01-UI-06 | The centered **Ask [Mentor] for help** dialog displays its title in a clearly bold heading. The explanatory text has distinct space below it, and **Request help** and **Close** appear in a dedicated action row with comfortable horizontal gap, inner button padding, and at least 44 px target height. At narrow widths the controls may wrap or stack without touching, clipping, or obscuring text. The existing backdrop, focus loop, Escape/Close behavior, and route to the request form remain intact. |

## Approved technical design addition

- Give the existing dialog heading an explicit semibold/bold font weight rather than relying on default `h2` styling. Match the hierarchy and spacing of the round-2 HTML mockup.
- Add a dialog action container around the existing link and Close button. Use a gap (approximately 10–12 px), top margin (approximately 20–24 px), balanced button padding and wrapping at small widths. Keep the current visual primary/secondary distinction and keyboard order.
- Scope these styles to this dialog; do not change global buttons or other confirmation dialogs.

## Approved verification addition

| ID | Verification scenario | Required observation |
| --- | --- |
| F01-UI-TC-06 | Inspect the dialog at desktop, 320 px width, short viewport, and zoom; use keyboard to reach Request help and Close. | Title is visibly bold; explanatory copy and actions have distinct spacing; buttons have comfortable padding and separation, wrap without clipping, and preserve focus/navigation behavior. |

**Scope:** This approval authorizes the dialog typography and action spacing above. It does not change request creation, routing, backend contracts, deployment, or release.
