# Approved UI refinement 2 — S2-D2-F01 Help Request Management

**Status:** Approved by Developer 2 for implementation on 2026-10-17  
**Date:** 2026-10-17  
**Source:** Developer 2 feedback and screenshots 1–2 supplied on 2026-10-17  
**Visual review:** [Static UI mockup](help-request-chat-ui-round2-review.html)  
**Approval reference:** Developer 2 replied “Approve. Make the necessary planned improvements” to the two draft refinements and mockup. The approved pre-metadata F01 draft has SHA-256 `323C48A53EF176E1CEABBB4BB7D2E4A315F17C703829F08156C64A2F6E47CA0C`; its exact bytes are retained in `Dev2-local-SDD-backups/2026-10-17-ui-refinement-round2-approved/`.

This approved refinement adds to the F01 PRD, TDD, Requirements-to-Tests (RTT), and first UI amendment. The existing request lifecycle, authorization, decision handling, and conversation provisioning requirements continue to apply.

## Approved product requirements

| ID | Requirement |
| --- | --- |
| F01-UI-04 | The **Ask [Mentor] for help** dialog on Student Mentor Discovery opens centered in the visible viewport, over its backdrop. It stays centered as the viewport changes, fits within narrow screens without clipping, and permits scrolling when its content exceeds the available height. Its title, explanation, **Request help**, and **Close** controls remain visible and keyboard accessible. This is the current help-request entry dialog, not the older informational dialog described before F01. |
| F01-UI-05 | On an accepted Mentor request detail, **Open conversation** is a visible primary button with white text on its green background in normal, hover, focus, and visited states. The button remains legible and keyboard reachable at all supported sizes. Remove the redundant **Request accepted.** success notice from the settled accepted view. Retain the **ACCEPTED** status badge and required decision/request metadata. Do not suppress distinct error, checking, uncertain, or retry feedback. |

## Approved technical design additions

- Center the existing modal dialog in the viewport using its native modal behavior and explicit positioning or layout rules compatible with the current shell. Bound width and height to the viewport and support internal scrolling at small heights. Preserve backdrop, focus entry/return, Escape/Close behavior, and the current Request help navigation.
- Resolve the button color specificity in the help-request page so its primary link has white text in every visual state. Use the existing primary button design and adequate foreground/background contrast. Keep one saved-state indicator, the ACCEPTED badge; render transient feedback only when it conveys a separate state or action outcome that is still relevant.
- Do not modify request status values, backend decisions, or conversation access rules for either change.

## Approved verification additions

| ID | Verification scenario | Required observation |
| --- | --- | --- |
| F01-UI-TC-04 | Open the Student Mentor Discovery help dialog at desktop, 320 px width, short viewport, and zoom; inspect keyboard, focus, Close, Escape, and Request help. | Dialog is visually centered in the available viewport, bounded/scrollable without clipping, and all controls remain operable. |
| F01-UI-TC-05 | Open a settled accepted Mentor request detail, then inspect the conversation button in normal, hover, focus, and visited states. Repeat at mobile width and with keyboard. Inspect separate error/uncertain states. | White button text is legible on green; one ACCEPTED badge remains; the redundant Request accepted notice is absent; important non-success feedback is still perceivable. |

**Scope:** This approval authorizes the two UI requirements above. It does not authorize changes to the request lifecycle, backend contracts, deployment, or release.
