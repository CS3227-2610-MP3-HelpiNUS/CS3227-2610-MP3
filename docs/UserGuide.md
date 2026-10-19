# HelpiNUS User Guide

## 1. About HelpiNUS

HelpiNUS helps NUS Students find suitable Mentors, request academic help,
communicate, book consultations, and receive role-specific AI assistance.
Mentors manage requests, availability, consultations, and AI-supported
summaries.

Sprint 1 provides account creation, sign-in, sign-out, session restoration,
role-based access, Mentor discovery, and Mentor profile management. Sprint 2
F01 adds Student help-request submission and history, a persisted Student
request summary, and a Mentor request inbox. The local F02 implementation adds
atomic Mentor acceptance and private request-linked text conversations for
the Student and addressed Mentor. The consultation calendar lets Mentors publish
availability and lets Students make and manage confirmed bookings. AI actions
remain scaffolds.

## 2. Supported users and devices

HelpiNUS has two roles:

- **Student** — may register publicly and access Student pages.
- **Mentor** — must be provisioned by a trusted administrator.

Laptop and mobile browsers are equally supported. The application targets WCAG
2.1 AA, including keyboard access, visible focus, semantic form labels,
sufficient contrast, and reduced-motion support.

## 3. Create a Student account

1. Open HelpiNUS and choose **Create a Student account**.
2. Enter your display name, email address, and password.
3. Select **Create Student account**.
4. Open the verification email from Firebase and verify the address.
5. Return to HelpiNUS and select **I’ve verified my email**. If the original
   message is unavailable, select **Send verification email** first.
6. If prompted, enter your name and select **Retry Student profile setup**.

Public registration always creates an `ACTIVE` Student profile. The form does
not accept a role or account status, so it cannot create a Mentor account or
elevate privileges.

Firebase creates the sign-in identity before HelpiNUS creates the authoritative
profile. If the second step is interrupted, the account remains unable to open
protected pages until the safe retry succeeds. The retry never changes an
existing role.

## 4. Sign in and restore a session

1. Enter the registered email and password.
2. Choose **Sign in**.
3. HelpiNUS verifies the identity and authoritative profile.
4. Students are sent to `/student/dashboard`; provisioned Mentors are sent to
   `/mentor/dashboard`.

Reloading the page restores a valid session. A missing, malformed, suspended,
disabled, email-mismatched, or unverified account fails closed and displays a
recovery explanation. If a local Auth emulator is restarted, an identity left
in browser storage is signed out automatically instead of becoming permanently
stuck.

If email verification is still required, use **Send verification email** (or
**Resend verification email** after the first request), complete verification,
then select **I’ve verified my email**. These controls remain available after a
page reload.

## 5. Student navigation

Desktop navigation appears in the left sidebar. On smaller screens, primary
destinations move to the bottom navigation and sign-out remains available in
the header.

| Destination | Current behaviour |
| --- | --- |
| Dashboard | Shows persisted help-request counts, recent requests, and your next confirmed consultation when available |
| Find a mentor | Browse available Mentors, search and filter loaded results, and inspect public details |
| Help requests | Submit, review, and track your own requests |
| Conversations | Open accepted request conversations, read saved history, send messages and see sender-side read status |
| Consultations | Find open Mentor times, book a consultation, and manage your bookings |
| Study assistant | Route and interface scaffold; no live LLM call |

Use **Skip to content** when navigating by keyboard to bypass repeated
navigation. The HelpiNUS brand returns to the dashboard for the authenticated
role.

### Find a mentor

1. Sign in as a Student and choose **Find a mentor**. The first page loads up to
   20 available Mentors. If **Load more** appears, choose it to add the next
   page without losing the Mentors already shown.
2. Use **Search loaded mentors** to find a name, biography text, or a supported
   module code or title. Search ignores letter case and spaces at the start or
   end of the query.
3. Use **Academic module** to show loaded Mentors who support that module.
   Available choices are active modules supported by at least one loaded
   Mentor. You can combine the module choice with text search. Choose **Clear
   module** to remove only the module filter; clear the search box to remove
   only the text search.
4. Choose **View details** on a Mentor to see their public biography, when
   provided, and supported modules. Only one Mentor's details are open at a
   time. A known inactive module is labelled **Inactive**. If module
   information is missing, the page says **Module information unavailable**;
   if the Mentor lists none, it says **No modules listed**.
5. Within the details, choose **Ask for help** to review the Mentor and your
   selected module, if any, in a centered dialog with a bold title and spaced action buttons. Choose **Request help** to open the request form, or
   **Close** or Escape to return to discovery. Opening the form does not send a
   request.

Search and module filtering apply only to Mentors already loaded. **Load more**
may reveal further matches or module choices. The list retains the order
returned by the service; it is not a ranking. Search and filter choices stay
in place while you load another page, and reset when you leave discovery.

While Mentor results or module information load, the page shows a status
message. The module selector is temporarily unavailable while module
information loads or needs a retry; name and biography search remain usable.
If no loaded Mentor supports an active module, the selector stays unavailable;
you can still browse Mentors and search names and biographies.
If the page cannot load Mentors, choose **Retry**. If **Load more** fails,
previously loaded Mentors remain visible and **Retry** requests that page
again. If module information fails, choose **Retry module information**. An
empty list says **No mentors available** when there are no further pages. If a
page is empty but **Load more** remains available, continue loading. If your
search or filter finds nothing, clear the controls or load more when offered.

### Send and track a help request

1. From a Mentor's **Ask for help** dialog, choose **Request help**. Select one
   active module that Mentor supports, enter a question title (up to 120
   characters) and a detailed question (up to 2,000 characters), then choose
   **Send request**. The form checks the selected Mentor's current public name
   and supported modules before enabling a new request. A direct link or page
   refresh performs the same check; if the selection is unavailable, return to
   Mentor discovery. The form preserves line breaks and trims outer spaces.
2. Wait for the saved confirmation and request detail. A network interruption
   may leave the result uncertain. Keep the draft and choose **Check this
   attempt again**; the app reuses the same operation ID and content. It also
   keeps an uncertain draft for the current account and selection across a
   refresh in the same browser tab. Signing out clears the private draft from
   that tab.
3. If a request to the same Mentor for the same module is already pending, no
   new question is delivered. The form keeps your draft and links to the
   existing request. Once that request is decided, you can send a new one.
4. Open **Help requests** to see your own recent and older requests. **Load
   more requests** appears when a page may contain further results. Choose
   **View details** on a request card to read its labelled request information
   and full question. The detail shows the Mentor, module, status, and decision
   time when decided. Module metadata that is no longer available is labelled
   **Module information unavailable**.

If supported modules fail to load, choose **Try again** on the request form.
If the app says a request needs support review, contact HelpiNUS support
before retrying that operation.

Your dashboard request panel uses saved request counts and recent records.
Its other activity widgets are still previews. A missing or changed account
permission shows an access/error state; it is not treated as an empty history.

### Use a conversation

After your addressed Mentor accepts a request, open its detail and choose
**Open conversation**, or use **Conversations** in Student navigation. Each
accepted request has its own conversation, even if you have other requests
with the same Mentor. The list labels the request title, Mentor and module,
and each card has an **Open conversation** button. It is ordered by newest
acceptance first. **Load more** reaches older accepted requests. A
request with an inconsistent or missing conversation shows support guidance
instead of a chat link.

The conversation fills the space beside the desktop navigation. Its header
contains **Back to conversations**, the other participant, module, and
question title. Expand **Request context** to read the full request title and
original question; long details scroll inside that section. On small screens the header also
keeps **Sign out** available. **Load earlier messages** reaches older history.
Enter plain text up to 4,000 characters in the
**Write a message…** field and choose the send icon, labelled **Send
message** for assistive technology. The field grows as you type multiple
lines, then scrolls vertically; internal line breaks remain and outer
whitespace is removed when sent.
The page shows **Sending** while a message is unresolved, **Sent** after it is
saved, and **Read** when the other participant's account has acknowledged it.
A question mark means saving is uncertain: **Retry** checks the server for
the same message ID before trying again. A definitive failure is labelled
**Failed**. Same-account refresh in the same browser session retains pending
message recovery; signing out or changing accounts clears it.

The official app acknowledges an incoming saved message when it enters the
foreground conversation viewport. Read does not prove the recipient paid
attention: a modified client can acknowledge early or withhold acknowledgement.

### Book and manage a consultation

1. Choose **Consultations**. The calendar and every time shown use Singapore
   time (GMT+8). Dates with open Mentor times are marked in the calendar.
   Use **Previous month**, **Next month**, or **Return to today**, then select
   a date to see its available times. Past dates are muted and unavailable.
2. Choose **Choose** beside a suitable time. Enter a short topic in **What
   would you like help with?**, then choose **Confirm booking**. A successful
   booking is confirmed immediately and appears under **Upcoming
   consultations** with the Mentor's name and time.
3. A time can be booked by only one Student. If somebody books it first, the
   app explains that the time is no longer available; choose another open
   time. You also cannot book a time that overlaps another one of your
   consultations. Your topic is kept while you choose a replacement. If there
   are no times on the selected date, choose another marked date or check a
   later month.
4. To cancel an upcoming booking, choose **Cancel**, then **Yes, cancel**.
   The booking moves to **History** and the time becomes available for another
   Student. Choose **Keep it** if you do not want to cancel.

When a confirmed consultation starts, it moves to **In progress** and can no
longer be cancelled. After its end time it appears in **History** as
**Awaiting Mentor outcome** until the Mentor marks it completed. Completed and
cancelled records remain in History; HelpiNUS does not automatically delete
them when their date passes.

The calendar lists open Mentor times. A booking is confirmed only while the
Mentor's account and profile remain active. HelpiNUS does not
create a video-call link, send calendar invitations or reminders, sync with an
external calendar, offer recurring availability, or provide a reschedule
button. Cancel a booking and make a new one instead when you need a different
time.

## 6. Mentor access

Mentors cannot register through the public form. An administrator provisions a
Mentor with a trusted backend script. After provisioning, the Mentor signs in
with the supplied Firebase Authentication identity and is routed to the Mentor
dashboard. Student URLs redirect back to the Mentor dashboard.

### Mentor dashboard

The Mentor dashboard welcomes you with a read-only summary of your own saved
profile. Choose **My profile** from the dashboard or Mentor navigation to open
the full profile at `/mentor/profile`; changes are made there. Returning to the
dashboard loads a fresh summary, so a confirmed profile edit can appear.

The profile overview shows your saved display name beside initials derived from
that name. Biography and supported modules appear in separate sections. The
summary shows a shortened biography. A blank
biography says **No biography provided**; an empty saved module list says
**No modules listed**. If either field is blank, **Complete your profile** opens
the profile page. With module information available, the dashboard previews up
to three verified active modules as compact labels and counts further active
modules. Inactive
or missing saved module references are counted as needing review. If a saved
module's details cannot be checked, the dashboard identifies them as
unavailable rather than calling them supported.

Your welcome and **My profile** link remain available while the summary loads.
If the profile read fails, choose **Try again**. If only module information is
unavailable, the dashboard keeps your saved name and biography, shows the
number of saved modules without guessed labels, and offers **Retry module
information**. If your own profile is missing, inactive, or invalid, follow
the administrator or HelpiNUS support guidance shown on the page. If account
access is denied during a read, the page clears the summary and checks the
session again; use its explicit **Try again** only after access is resolved.
The dashboard also shows a consultation schedule summary. It states whether
your consultation list is loading or unavailable, shows the next confirmed
consultation when there is one, and links to **Manage availability**. It does
not show a full consultation history; use **Consultations** for that.

### Review help requests

Choose **Help requests** in Mentor navigation. **Pending** shows requests
addressed to you, oldest first. **Decided** shows accepted and rejected
history, newest first. Use **Load more requests** for another page and choose
**View details** on a request card for the question, Student display name,
module, status, and times. The request page does not show the Student's email
address.

To decide a pending request, choose **Accept** or **Reject**, review the
pop-up confirmation, then choose **Accept request** or **Reject request**.
**Cancel** or Escape closes the pop-up without deciding. Acceptance saves the
request and its matching conversation in one transaction; the page checks the accepted pair
before offering **Open conversation**. If confirmation is interrupted, check
the live status and use **Retry same decision** while it remains pending.
The accepted detail shows one **ACCEPTED** badge and a white-text
**Open conversation** button, without a second success notice.
The Mentor **Conversations** list and detail use the same request-linked chat
as the Student view, with the Student's historical display name and question
context. The message, history, retry and read-status behavior above applies
to both roles.

### Manage consultation availability

1. Choose **Consultations** in Mentor navigation. The calendar, form, and
   times are all in Singapore time (GMT+8). Select a future date; dates with
   your existing availability are marked in the calendar.
2. Under the selected date, set **Starts** and **Ends**, then choose **Add
   availability**. Each opening must start and end on a half-hour boundary and
   last from 30 to 120 minutes. Overlapping availability is not allowed,
   although back-to-back openings are allowed. Invalid fields explain whether
   the end is not later than the start, the time is in the past, the boundary
   is not `:00` or `:30`, or the duration is outside the allowed range.
3. An unbooked opening is labelled **open**. Choose **Withdraw** to remove it
   before a Student books it. A withdrawn time is not offered to Students.
4. When a Student books an opening, it is labelled **booked** and shows the
   Student's name and booking topic. The booking is already confirmed; there
   is no separate Mentor approval step.
5. To cancel a future booked consultation, choose **Cancel consultation**,
   then **Yes, cancel**. This cancels the consultation and withdraws that time
   so it cannot be booked again. Choose **Keep it** to leave it unchanged.
6. A consultation moves to **In progress** at its start time. After its end
   time it moves to **History** as **Awaiting Mentor outcome**. Choose **Mark
   completed** to record the outcome. Students cannot complete appointments.

Past times are retained as history rather than new availability. A no-show
outcome is not currently available; do not use **Completed** to represent a
no-show. Use the
calendar controls to move between months. If availability or consultations
cannot load, use the page's **Try again** button after your connection or
account access is restored.

### Manage your Mentor profile

1. Choose **My profile** in the Mentor navigation. The page shows your saved
   display name, biography, and supported modules. These are the public details
   Students can see in **Find a mentor**. Your display name is read-only here.
   A blank biography says **No biography provided**; an empty module list says
   **No modules listed**.
2. Choose **Edit profile** to change your biography or supported modules. The
   biography is plain text, can include line breaks, and is limited to 1,000
   characters after outer whitespace is trimmed. An empty biography is allowed.
3. Enter the beginning of a module **code or title** in **Find modules by code
   or title prefix**. Search ignores letter case. Results offer active modules
   only. Choose **Add** for a result, and **Remove** beside a selected module
   to remove it. **Load more** retrieves the next page when available. Selected
   modules stay visible when you change the search. You may select up to 30
   unique modules, including any previously saved inactive or unavailable ones.
4. Review the biography and selected modules, then choose **Save profile**.
   An unchanged draft cannot be saved. Wait for **Profile saved.**, which appears
   only after HelpiNUS confirms the stored profile with a fresh read. A Student
   opening or refreshing discovery afterward can see the accepted public
   biography and modules; a Student page already open may still show its
   previously loaded results.

Previously saved inactive modules are labelled **Inactive**. If a saved module
record is missing, this page shows **Module information unavailable** and its
ID so you can identify or remove it. Neither kind can be newly added. If module
information is temporarily unavailable, choose **Retry**; you can keep editing
the biography, but module changes pause until the information recovers. A
failed module search has **Retry search** and keeps your selected modules;
module changes remain paused until search succeeds. A
newly selected module that becomes ineligible before Save must be removed or
replaced before the profile can be saved.

**Cancel** or navigating within the app with unsaved changes asks whether to
**Keep editing** or **Discard changes**. Leaving the page does not store the
draft. If a save may have completed but confirmation failed, keep the draft and
use **Retry save or confirmation**; do not assume the change was saved. If the
profile changed elsewhere, review the latest profile and choose **Discard
draft and show latest** or **Reapply my draft**. Reapplying requires another
explicit Save and cannot overwrite the latest version silently.

If the profile cannot load temporarily, choose **Try again**. If the profile is
missing, inactive, or invalid, the page stays read-only and directs you to an
administrator or HelpiNUS support. A sign-out or loss of Mentor access clears
the draft and requires you to sign in or resolve account access before editing.

## 7. Sign out

On a laptop, choose **Sign out** at the bottom of the sidebar. On mobile, choose
**Sign out** in the top header. A successful sign-out returns to the login page.
If the network operation fails, HelpiNUS keeps the current screen and shows a
retryable error instead of pretending the session ended.

## 8. Run HelpiNUS locally with mock data

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev --workspace src/frontend
```

If no Firebase Web configuration is present, HelpiNUS intentionally uses its
mock service adapter. Open the URL printed by Vite. This mode demonstrates the
Student dashboard, navigation, Mentor discovery, and a simulated help-request
flow without contacting Firebase. These mock requests are not persisted to
Firestore. Mentor names beginning with **Sample** and their
module information are demonstration data, not live Mentor profiles.

## 9. Run with Firebase emulators

Copy and configure the frontend environment:

```bash
cp src/frontend/.env.example src/frontend/.env.local
```

Add the `helpinus-dev` Firebase Web App values and set:

```text
VITE_FIREBASE_ENV=development
VITE_USE_FIREBASE_EMULATORS=true
```

From the repository root, use Node 22 and Java 21 or newer to start the
emulators, seed the demo accounts, and serve the frontend:

```bash
npm run dev:emulators
```

Open `http://127.0.0.1:5173/`. Press `q` then Enter in the terminal to stop
the session and export emulator data to `.emulator-data/`. The next run imports
that data before seeding missing records.

Alternatively, start Auth, Firestore, and Functions manually:

```bash
npx firebase-tools emulators:start --only auth,firestore,functions \
  --project helpinus-dev
```

In another terminal, seed the demo users:

```bash
FUNCTIONS_EMULATOR=true \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
npm run seed:emulator --workspace src/functions
```

Then start the frontend:

```bash
npm run dev --workspace src/frontend
```

### Emulator-only accounts

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@example.test` | `Student-demo-123!` |
| Mentor | `mentor@example.test` | `Mentor-demo-123!` |
| Jamie Tan (Student) | `jamie.tan@example.test` | `Jamie-demo-123!` |
| Sample Aisha (Mentor) | `aisha@example.test` | `Aisha-demo-123!` |

The seed marks all demo emails verified so Firestore Rules allow module reads.
The accounts and synthetic emulator-only verification fallback must not be used
in a real Firebase project.

The emulator seed has a Demo Mentor with no listed modules and Sample Aisha
with `CS2103T` and `CS2040S`. Jamie Tan can request help from Sample Aisha for
either module. The catalogue also has inactive `CS3230`; it does not appear
as a new selection. Re-running the seed preserves existing demo profile edits
and module records while the emulators are running. Live Firebase mode displays
the eligible Mentor records and module information available in that environment.

Use `npm run dev:emulators` from the repository root for this two-account
conversation walkthrough. A plain frontend `npm run dev` without Firebase web
configuration opens a mock preview: it initially shows Jamie Tan, does not
authenticate entered credentials, and cannot accept a request.

To try the conversation flow, sign in as Jamie Tan with the emulator credentials
above, find **Sample Aisha**, and request help for `CS2103T` or `CS2040S`.
Sign out, sign in as Sample Aisha, open **Help requests**, and accept Jamie's
pending request. Choose **Open conversation** on the accepted request, or open
it from **Conversations**. Sign back in as Jamie to see the same saved chat.
Requests made in the mock preview are separate fixtures and do not transfer
into the emulator.

## 10. Manual Sprint 1 verification

### Mock frontend

1. Remove or temporarily rename `src/frontend/.env.local`.
2. Start the frontend.
3. Confirm the Student dashboard renders sample data.
4. Open **Find a mentor** and confirm the Sample Mentor list, search, module
   filter, details, **Ask for help** dialog, and **Request help** form work.
   Confirm **Help requests** shows the simulated result. Open the remaining
   Student destinations and confirm their labelled scaffolds render.
5. Narrow the browser to a phone-sized viewport.
6. Confirm bottom navigation, header branding, and mobile sign-out are usable.
7. Use only the keyboard to reach navigation, form controls, and sign-out;
   verify the focus indicator remains visible.

### Emulator Student

1. Start and seed the emulators using Section 9.
2. Sign in as `student@example.test`.
3. Confirm the Student dashboard opens.
4. Reload and confirm the session is restored.
5. Enter `/mentor/dashboard` manually and confirm the app returns to the Student
   dashboard.
6. Sign out and confirm protected URLs return to login.

### Emulator Mentor

1. Sign in as `mentor@example.test`.
2. Confirm the Mentor dashboard opens with the saved profile summary and a
   **My profile** link. The seeded Mentor initially has no listed modules.
3. Open **My profile**, make and save a profile change, then return to the
   dashboard and check that it reads the saved change.
4. Enter `/student/dashboard` manually and confirm the app returns to the Mentor
   dashboard.
5. Confirm both desktop and mobile sign-out work.

### Registration and recovery

1. Register a new `@example.test` Student while using the emulator.
2. Confirm no role selector is shown.
3. Confirm the new account reaches the Student dashboard.
4. Stop and restart the Auth emulator without clearing browser storage.
5. Refresh HelpiNUS and confirm the stale local identity is safely returned to
   signed-out state.
6. In a real development project, repeat registration with a non-synthetic
   address and confirm protected access is denied until email verification and
   profile retry succeed.

## 11. Troubleshooting

### “We couldn’t load your account”

- Confirm all three emulators are running if emulator mode is enabled.
- Confirm the frontend uses loopback emulator hosts.
- Restart the frontend after changing `.env.local`.
- Select **Try again** after connectivity is restored.
- A stale emulator identity should now be removed automatically; if an older
  build is still cached, use a private window or clear the site data once.

### “Verify your email”

Open the Firebase verification message, complete verification, return to
HelpiNUS, and select **I’ve verified my email**. Use **Send verification email**
or **Resend verification email** when needed.

### “Your profile is not ready”

Enter the Student name and choose **Retry Student profile setup**. This also
repairs an Auth identity whose display name could not be saved during initial
registration. If the profile remains unavailable, confirm that the Functions
emulator or deployed `initializeStudentProfile` function is reachable.

### “Firebase is not configured”

Check that every required `VITE_FIREBASE_DEV_*` value is present in
`src/frontend/.env.local`, then restart Vite. Never paste a service-account JSON
key into the frontend configuration.

### Forgot password

The page is currently a Sprint 1 placeholder. Password-reset delivery has not
yet been implemented; use the Firebase console only for authorized development
accounts until that feature is adopted.
