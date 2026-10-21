---
version: 1
slug: "d-src-pages-studentstudyassistantpage-tsx-9b67ef00"
primary_target: "src/frontend/src/pages/StudentStudyAssistantPage.tsx"
related_targets: []
---

# Student Study Assistant surface brief

Scope: `/student/study-assistant`, an Operate-mode extension of the established HelpiNUS application. Active Students use it to ask source-grounded questions, revisit recent study conversations, and verify answers through trusted citations. It must remain separate from Mentor AI features, render model output as plain text, and work on laptop and mobile browsers.

## Direction contract

THESIS: A calm study desk where the source trail is as important as the answer. It refuses the generic full-screen chatbot: conversation history, the current learning thread, and evidence remain simultaneously legible without turning every region into a card.

OWN-WORLD: Preserve HelpiNUS paper, ink, quiet green, thin rules, compact typography, and restrained radii. Use one continuous workspace split by a narrow history rail and a generous reading column; Student messages are concise green-tinted notes, assistant responses are open text with an attached source ledger.

STORY: The Student opens an empty local thread, asks one focused question, reads a bounded explanation, checks its approved sources, continues the thread, and can return to or delete an unexpired conversation. Unsupported questions visibly stop at insufficient context.

FIRST VIEWPORT: The page heading and trust notice sit above a two-column workspace. The left rail contains New conversation and recent threads. The right column leads with the empty-state guidance or message log, with the labelled composer anchored below. The primary Send action stays beside the character count and remains reachable above mobile navigation.

FORM: Established-world extension in Operate mode, chosen as the focused study desk structure. It is the strongest fit for frequent reading and source checking; seed key: not applicable because the approved product prompt precisely specifies a local extension rather than an open composition round.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved external dependency: the production SoCLaaS model, endpoint contract, and dedicated server-side secret must be configured by the human. Synthetic emulator behavior must remain clearly labelled and production must fail closed until that configuration is present.
