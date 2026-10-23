# HelpiNUS User Guide

> **Test HelpiNUS on the live production site:**
> [Open HelpiNUS Production](https://helpinus-prod.web.app)
>
> This is the official hosted application. You do not need to install anything
> to use it.

## 1. About HelpiNUS

HelpiNUS helps NUS Students find Mentors, request academic help, and message a
Mentor who accepts their request. Mentors can review requests, message Students,
and manage their public profile. Students can also use the Study assistant.

The consultation calendar lets Mentors publish availability and lets Students
make and manage confirmed bookings. The current local build also includes a
Mentor consultation draft for accepted conversations; its availability in a
hosted version depends on that version's deployment and AI configuration.

## 2. Supported users and devices

HelpiNUS has two roles:

- **Student** — may register publicly and access Student pages.
- **Mentor** — may register publicly to offer academic help.

Each Google account has one role. Dashboard navigation does not offer role
switching; use a different Google account if you need a separate role.

The navigation adapts to desktop and smaller screens. Keyboard users can use
**Skip to content** to bypass repeated navigation.

## 3. Create an account

1. Open the [HelpiNUS production site](https://helpinus-prod.web.app) and choose
   **No, create an account**.
2. Choose **Student (mentee)** or **Mentor** under **Account type**.
3. Select **Continue with Google** and choose your Google account in the popup.
4. If that account does not provide a display name, enter your name and select
   **Finish Student profile setup** or **Finish Mentor profile setup**.

An existing account cannot register under the other role. HelpiNUS does not
collect or store a password. If profile setup is interrupted, return to
registration and choose **Continue with Google** again. The page may ask for
your name to finish setup. Check the Google email shown on the page, or choose
**Use another Google account** if it is the wrong account.

## 4. Sign in and restore a session

1. Choose **Yes, sign in**, then **Continue as Student** or **Continue as Mentor**.
2. Select the Google account connected to that role in the popup.
3. HelpiNUS checks the account and opens the dashboard for that role.

Reloading the page restores a valid session. If the account cannot be verified,
the page explains how to retry or contact support. Closing the Google window
returns to sign-in. If pop-ups are blocked, allow them for HelpiNUS and try
again.

Choosing the wrong role shows guidance to sign in using the existing role; it
does not create another profile. A Google identity without a HelpiNUS profile
is offered registration. Older accounts with conflicting Student and Mentor
profiles require support review; their data is retained.

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
| Study assistant | Private source-grounded questions, multi-turn history, citations, safe retry, and deletion |

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

### Use the Study assistant

1. Choose **Study assistant** in Student navigation. The initial **New
   conversation** exists only in this browser view; nothing is saved until you
   send the first message.
2. Enter a plain-text question of up to 4,000 characters and choose **Send
   message**. The assistant searches only its approved source collection. A
   supported answer includes a per-message **Sources** list with the source
   title, section, and version. Open a source to verify the answer.
3. Continue asking questions in the same conversation. Only a bounded amount
   of recent conversation context is used both to find approved sources and to
   answer, so natural follow-ups can retain their recent topic. Choose a
   conversation under **History** to reload its saved messages and citations,
   and **Load earlier messages** when available. If you open another
   conversation while an answer is pending, the answer remains saved to the
   conversation where you sent it and does not replace the conversation you
   opened.
4. If the approved sources do not contain enough relevant information, the
   answer is labelled **Not enough approved context** and has no citation. Try a
   narrower question or consult your course materials; the app does not invent
   a source to fill the gap.
5. If delivery becomes uncertain, choose **Retry message**. The app reuses the
   exact request ID and text so the server can return the original result
   without creating a duplicate. Resolve or discard that recovery before
   starting another conversation. A definitive validation or access failure is
   not offered as a retry.
6. Choose **Delete conversation**, review the warning, and choose **Delete** to
   remove its saved content. This cannot be undone.

#### Copyable example prompts

Copy one of these prompts into **Ask a question**, or adapt it to the concept
you are studying.

**CS2030S — generics and PECS**

```text
Explain Java's PECS rule in simple terms. When should I use ? extends and ? super?
```

**CS2030S — object-oriented design**

```text
Compare composition and inheritance, and explain how the Liskov Substitution Principle helps me choose between them.
```

**CS2030S — streams**

```text
Explain the roles of a stream source, intermediate operations, and a terminal operation. When would flatMap be useful?
```

**CS2103 — requirements**

```text
Explain the difference between functional and non-functional requirements, with one example of each for a student task-management app.
```

**CS2103 — test-case design**

```text
How should I use partitions, boundary values, and invalid inputs to design test cases for an age field that accepts values from 18 to 100?
```

**CS2103 — refactoring**

```text
What makes refactoring different from rewriting code, fixing a bug, or adding a feature?
```

For a natural follow-up, keep using the same conversation. For example, ask
the PECS question above and then send:

```text
Why is the producer unable to safely accept most values in that example?
```

If the assistant responds with **Not enough approved context**, mention the
module and exact topic in a new question, such as `CS2103 test-case design`,
and avoid relying on the assistant for material outside CS2030S or CS2103.

Conversation access expires 14 days after its latest activity. Expired
conversations no longer appear in your history. An explicit deletion removes
the conversation from your view immediately. Only Students can use the Study
assistant.

Assistant output is displayed as plain text. It may still be inaccurate, so
check the cited source and your course requirements. Use it to understand and
work through material; do not submit generated work as your own.

The Study assistant is limited to CS2030S Programming Methodology II and CS2103
Software Engineering. Its approved static corpus contains concise material
selected from the CS2030S 2021 Semester 2 notes and the CS2103/T AY2025/26
Semester 1 textbook, and every grounded answer links back to the relevant
public source page. It does not browse the web or answer from arbitrary module
material during a conversation.

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

Mentors register through **No, create an account**, choose **Mentor**, and
continue with Google. Returning Mentors choose **Yes, sign in**, then
**Continue as Mentor**. Student URLs redirect back to the Mentor dashboard;
there is no dashboard role-switching control.

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

### Review a consultation draft in the local build

If your local build has AI drafting configured, open an accepted conversation
as its Mentor and choose **Summarise Conversation** in **Consultation draft**.
The button is available only to the Mentor in that conversation. It starts a
draft only when selected; opening the conversation or receiving a message does
not start one. While the request runs, the page says **Preparing consultation
draft…**.

If a draft is returned, review its **Conversation summary**, **Unresolved
Student questions**, **Suggested teaching approaches**, and **Limitations or
missing context**. A **Partial history** notice means earlier messages were
omitted. The fields are displayed as text in this build; there is no edit or
save control. The draft is not sent as a chat message or saved to the
conversation. Leaving the conversation or changing accounts clears it.
Check the draft against the conversation before relying on it.

If there are no messages, the page says there is nothing to summarise. If AI
drafting is not configured or the request fails, the page shows an explanation
and adds no draft. A busy service may ask you to try again shortly; a timeout
may still count as an attempt. Your messages remain available in the
conversation. Availability of this local-build feature in a hosted app has not
been confirmed.

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

## 8. Troubleshooting

### “We couldn’t load your account”

Check your connection and choose **Try again**. If the message continues,
contact HelpiNUS support. If you are using a local development build, ask its
maintainer to check the development services.

### Google sign-in does not open

Allow pop-ups for HelpiNUS and try again. If the page still reports that Google
sign-in is unavailable, contact HelpiNUS support.

### “Your profile is not ready”

Return to registration, choose your role, and continue with Google. If prompted
for your name, choose **Finish Student profile setup** or **Finish Mentor
profile setup**. If access still fails, contact HelpiNUS support.

### Forgot password

HelpiNUS does not own Google passwords. Choose **Recover your Google account**
on the recovery page to open Google's account-recovery service.
