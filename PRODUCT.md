# HelpiNUS product truth

HelpiNUS helps NUS Students find suitable Mentors, request academic help,
communicate, book consultations, and receive role-specific AI assistance.
Mentors manage requests, availability, consultations, and AI-supported
summaries.

## Users and outcomes

- **Students** discover mentors, request help, hold conversations, reserve
  consultations, and use a study-assistance feature.
- **Mentors** respond to requests, publish availability, manage consultations,
  communicate with students, and generate consultation summaries.

`STUDENT` and `MENTOR` are the complete role set. Public registration always
creates a Student. Mentor provisioning is a trusted administrative operation.

## Product constraints

- Laptop and mobile browsers are equally supported.
- Accessibility targets WCAG 2.1 AA, including keyboard access, visible focus,
  semantic labels, sufficient contrast, and reduced-motion support.
- The interface is intentionally simple and role-specific.
- Development and production use separate Firebase projects.
- AI features use the NUS SoC LLM service in a later sprint. Sprint 1 defines
  contracts and safe boundaries without making live model calls.

## Out of scope for Sprint 1

- Production AI prompts, model integration, or model-generated content.
- Complete domain workflows beyond their contracts and infrastructure seams.
- Visual polish beyond a coherent, accessible application foundation.
