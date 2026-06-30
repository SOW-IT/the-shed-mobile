# The Shed Mobile — End-to-End Test Checklist

Manual QA checklist covering the three core areas: **Requests**, **Attendance**, and **Admin**.
Derived from the current codebase. Check each box as you verify it. Flag anything that fails with a note + screenshot.

**Conventions used throughout:**
- "Staff year" = Oct 1 → Sep 30 rollover (e.g. an event on 15 Jan 2026 belongs to staff year 2025).
- "Calendar year" = Jan–Dec (used only for the student **Year** metadata field).
- Test with multiple accounts/roles where noted (requester, HOD, Budget Manager, Director, Finance Head, admin, plain staff).

---

## 0. Pre-flight / Setup

- [ ] Sign in succeeds with a sow.org.au Google account
- [ ] Tab bar shows the correct tabs for the signed-in user's roles (Requests, Attendance, Admin visibility all role-gated)
- [ ] Profile photo / name load from directory
- [ ] Have test accounts ready: a plain staff member, an HOD, the Budget Manager, the Director, the Finance Head, and an admin

---

# 1. REQUESTS (Reimbursement)

> Only **reimbursement** requests exist. Lifecycle: `AWAITING APPROVAL → AWAITING RECEIPT → AWAITING PAYMENT → PAID` (or `DECLINED` at any approval step).
> Approval chain: **HOD → Budget Manager → Director (only if amount ≥ threshold, default $5,000) → Finance Head**.

## 1.1 Tab visibility & structure
- [ ] **Mine** tab visible to all users with a profile
- [ ] **Review** tab visible only to users who are an approver
- [ ] **All** tab visible only to Finance **department members** — gated by `me.isFinance` (`convex/directory.ts` → `isMemberOfDepartment(profile, FINANCE)`), i.e. anyone assigned to the Finance department, **not** only the Finance Head
- [ ] **Bank** tab visible to all users
- [ ] Tab badges: Mine shows count needing action; Review shows total pending; message badges show unread comment counts

## 1.2 Submit a request
- [ ] **+ Make Request** opens the new-request sheet from the Mine tab
- [ ] Department defaults to HOD's dept (or first assigned dept)
- [ ] Submit with valid Description + positive Amount + Department → status `AWAITING APPROVAL`, appears in Mine
- [ ] Validation — empty description blocked: "Please describe what the request is for."
- [ ] Validation — amount ≤ 0 blocked: "Amount must be a positive number."
- [ ] Validation — no department: "Pick a department for this request."
- [ ] Validation — submitting into a role that doesn't exist for the year is blocked with the "[year] has no [role]" message
- [ ] Requester gets a "Request submitted" email (no push for own action)

## 1.3 Auto-approval rules
- [ ] If requester **is** the HOD for the dept → HOD step auto-approves
- [ ] If requester is the Director or Head of Division → HOD step auto-approves
- [ ] Finance department requests skip the HOD step entirely
- [ ] If requester is the Budget Manager → Budget step auto-approves
- [ ] If requester is the Director → Director step auto-approves
- [ ] A request where the requester fills every approver role auto-approves straight to `AWAITING RECEIPT`

## 1.4 Approval workflow (Review tab)
- [ ] Pending requests grouped under the correct section: "Awaiting Your HOD / Budget / Director / Finance Head Approval"
- [ ] **Approve** → confirmation modal → moves to next step; next approver notified (push + email)
- [ ] After final approval → status `AWAITING RECEIPT`, requester + all prior approvers notified
- [ ] **Decline** requires a non-empty reason (client + server); empty reason blocked
- [ ] Decline → status `DECLINED`; requester (with reason) + all prior approvers notified
- [ ] Actioned requests appear in the collapsible **Reviewed** section (max 50)
- [ ] Cannot approve your own request: "You can't review your own request."
- [ ] Cannot approve out of order / wrong step (prior steps must be approved)

## 1.5 Director threshold
- [ ] Request with amount **below** threshold skips the Director step
- [ ] Request with amount **≥** threshold requires the Director step
- [ ] Changing threshold in Admin (see 3.6) affects new requests accordingly

## 1.6 Receipt submission (requester, after full approval)
- [ ] Cloud-upload icon opens the **Submit Receipt** sheet
- [ ] Add recipient with Account Name, BSB (digits only), Account Number (digits only), positive amount, ≥1 file
- [ ] Saved bank account chips auto-fill recipient fields; **×** forgets the account
- [ ] "Save Account for Future Use" toggle behaves (hidden/disabled when already saved)
- [ ] Validation — no account name: "Every recipient needs an account name."
- [ ] Validation — non-digit BSB/account: "BSB and account number must be digits only."
- [ ] Validation — no file attached: "Attach at least one receipt file."
- [ ] Validation — file > 2MB rejected; file name > 200 chars rejected
- [ ] Validation — >10 files per recipient / >50 total / >20 recipients rejected
- [ ] Receipt total > requested amount → confirmation modal ("Submit anyway?"), not a hard error
- [ ] On submit → status `AWAITING PAYMENT`; Finance Head notified

## 1.7 Payment (Finance Head)
- [ ] Receipt-submitted requests appear in the **Ready to Pay** section
- [ ] **Mark as paid** opens Pay Reimbursement sheet with read-only receipt details
- [ ] Enter positive paid amount (+ optional comment) → status `PAID`; requester notified
- [ ] Paid amount ≠ requested amount → Budget Manager notified of the difference
- [ ] Paid amount ≤ 0 blocked: "The paid amount must be a positive number."
- [ ] Only Finance Head (or delegate) can pay

## 1.8 Requester actions
- [ ] **Cancel** (trash) on an in-flight request → confirmation → deleted; involved approvers notified
- [ ] **Delete** a declined request → confirmation → deleted (no notifications)
- [ ] **Resubmit** (refresh) a declined request → new-request sheet pre-filled with original description/amount/dept
- [ ] **Nudge** (hand icon) → reminder to whoever the request is waiting on
- [ ] Nudge cooldown: blocked within 24h, shows "You can nudge again in Xh Ym"
- [ ] Cannot nudge when request is waiting on yourself / already completed

## 1.9 Comments
- [ ] Comment thread opens from the chat-bubble icon on any request
- [ ] Adding a comment notifies the current action owner
- [ ] Unread badge on chat icon + tab message badge increments correctly, clears when read
- [ ] Emoji reactions work

## 1.10 All tab (Finance) & sorting
- [ ] Segmented control: **Ongoing** vs **Completed**
- [ ] Ongoing sorts by unread comments → status priority → date
- [ ] Completed is paginated (20 at a time, infinite scroll)
- [ ] Year picker (top-right) lets Finance browse prior years (back to 2021), read-only
- [ ] Prior-year warning copy shows re: receipt file deletion on Oct 1
- [ ] Carry-over: an incomplete prior-year request still appears in Mine/All; both the original-year approvers and current officeholders can action it

## 1.11 Empty states
- [ ] Mine (none): "No requests yet" + make-request hint
- [ ] Review (none): "All caught up"
- [ ] All Ongoing/Completed (none): correct empty copy

---

# 2. ATTENDANCE

> Route: 5 tabs — **Events, Members, Tags, Metadata, Audit** — plus the per-event sign-in screen.
> Members & metadata are year-less; events/tags are keyed by staff year.

## 2.1 Events tab
- [ ] Campus/subgroup ring selector shows all groups, highlights selection
- [ ] "No groups yet" empty state when no campuses exist in Admin
- [ ] Event list sorted within the staff year; status badge cycles UPCOMING → LIVE → ENDED (updates ~every 60s)
- [ ] LIVE event shown green; ENDED greyed
- [ ] Event card shows date/time range, "ATTENDANCE: N", tag pills, subgroup pills (collaborative)
- [ ] "Load more" paginates
- [ ] Tapping a card opens the event sign-in screen
- [ ] Edit (pencil) opens Create/Edit Event sheet; Export opens Export sheet

## 2.2 Create / edit event (4-step wizard)
- [ ] Step 0 Name — Next disabled until name entered
- [ ] Step 1 Tags — only tags applicable to selected collaborators shown; "Add tags in Tags first" when none
- [ ] Step 2 Collaboration — owner group locked/selected; can toggle other groups
- [ ] Step 3 Schedule — date `YYYY-MM-DD`, start/end `HH:MM`; invalid format error shown
- [ ] End time ≤ start time → auto-extended +2h
- [ ] "Weekly Meeting" tag pre-fills next matching weekday + slot times
- [ ] Create → saves and navigates to event; Edit Save disabled until dirty
- [ ] Delete event → type-name-to-confirm; deletes event + all its attendance records
- [ ] Cancel / backdrop with unsaved changes → "Discard changes?" confirm

## 2.3 Event sign-in screen
- [ ] Header shows count chip ("N signed in"); updates optimistically
- [ ] Search filters both Signed-in and Not-signed-in lists by name/email
- [ ] **Swipe left** on a not-signed-in row → signs in (appears instantly in Signed In)
- [ ] **Swipe left** on a signed-in row → signs out (moves back)
- [ ] **Swipe right** on any row → opens Edit Member sheet
- [ ] Not-signed-in list ordered by attendance frequency; "Everyone in the pool is signed in 🎉" when empty
- [ ] Signing in the same person twice is a no-op (idempotent)
- [ ] Notes field appears in edit sheet only for signed-in attendance
- [ ] "Create [search text]" footer button creates a member and signs them in
- [ ] "Load more" works on both lists
- [ ] **Multi-user sync:** sign-in/out on device A animates in/out on device B

## 2.4 Past / ended event editing
- [ ] Ended event shows the "This event has ended…" banner + **Enable editing** button
- [ ] Edit / sign-in / sign-out disabled until "Enable editing" tapped (with confirmation)
- [ ] After unlock: can sign in a missed attendee
- [ ] Attendees who signed in **during** the event cannot be signed out (row locked/greyed)

## 2.5 Members tab
- [ ] Search (400ms debounce) + clear button
- [ ] Filter panel: Sort by (Name or metadata), Asc/Desc, metadata select filters; "Clear All"
- [ ] Active filter count shown; pagination resets on search/filter/sort change
- [ ] "TOTAL: N" reflects all members (not the filtered subset)
- [ ] Member row tap opens Edit Member; staff row with no member yet calls ensure-for-staff then opens
- [ ] Campus pill shows university colour / "STAFF" / "OTHER"; avatar from profile or placeholder
- [ ] "No members match" empty state

## 2.6 Edit member sheet
- [ ] Create mode: name required, email optional, metadata fields shown
- [ ] Duplicate name on create → "A member with this name already exists. Add anyway?"
- [ ] Edit mode: fields pre-filled; save updates record
- [ ] Delete member → type-name-to-confirm; removed from pool
- [ ] Student **Year** field shows calendar year at viewing time

## 2.7 Tags tab
- [ ] Add tag → blank card; name editable; colour swatch (blue/purple/pink/red/orange/yellow/green/teal) selectable
- [ ] "Applies to" subgroup scope — must apply to ≥1 subgroup (can't deselect all)
- [ ] Delete existing tag → type-name-to-confirm; unsaved new tag shows close icon to discard
- [ ] **Save tags** disabled when no changes; shows "Saving…"; "unsaved changes" note appears
- [ ] Discard changes → confirmation
- [ ] Tag order preserved across reload

## 2.8 Metadata tab
- [ ] Locked fields (Year, Gender, Campus, Role) read-only, cannot be deleted, options locked
- [ ] Select-type field: add/remove custom options; input-type has no option editor
- [ ] Drag to reorder fields
- [ ] Add field → choose select/input
- [ ] Delete field → type-name-to-confirm
- [ ] Subgroup scope: global or specific subgroups
- [ ] Saved field appears in member edit sheet; metadata is shared across all staff years

## 2.9 Audit tab
- [ ] Immutable list with entity icons (Events/Members/Tags/Fields/Roll-call), actor, time-ago
- [ ] Time-ago formats: "just now", "Xm ago", "Xh ago", "Xd ago", "24 Jun"
- [ ] Search (400ms debounce) filters summary/detail
- [ ] Filters: Action type, Performed by, Event — combine with AND; "Clear All"; active count
- [ ] "Load more" paginates (unfiltered)
- [ ] ✅ **FIXED (regression watch):** pagination used to crash when a filter/search was active and you loaded more pages. Now fixed via convex-helpers' `paginator` (see CHANGELOG → Unreleased → Fixed). Confirm filtered + searched audit can load multiple pages without the "ran multiple paginated queries" crash.
- [ ] ✅ **FIXED (regression watch):** tag "save all" audit spam — saving the Tags tab now logs only changed tags, not every tag. Confirm editing one tag writes a single audit row.

## 2.10 Export
- [ ] Group export (no event): date-range + tag filters; metadata field checkboxes
- [ ] Event export: single event, metadata field checkboxes
- [ ] CSV always includes Sign In, Name, Email + locked fields (Student Year, Gender, Campus, Role) + selected custom fields
- [ ] Downloaded filename slug correct; special characters in names/emails escaped
- [ ] Empty result set handled gracefully

## 2.11 Year scoping (spot-check)
- [ ] Event dated Oct 1 2025 / Dec 25 2025 / Jan 15 2026 / Sep 30 2026 all map to staff year 2025
- [ ] Event dated Oct 1 2026 maps to staff year 2026
- [ ] Members/metadata identical across staff years

---

# 3. ADMIN

> Tabs: **Users, Structure (Roles/Divisions/Departments/Universities), Other**.
> Admin = Director, Head of HR division, Data & IT dept, or any dept under HR. Finance Head sees only the **Other** tab (Budget Manager + threshold).
> Source of truth for admin eligibility: `isAdminProfile` in `convex/model.ts`, using `ADMIN_DEPARTMENTS` / `ADMIN_DIVISIONS` in `shared/flow.ts` (re-verify here if those change).

## 3.1 Access & year picker
- [ ] Admin tab visible only to admins or the Finance Head; non-admins get "Only admins can access this screen."
- [ ] Finance Head sees only the Other tab
- [ ] Year picker (top-right): admins can edit current + next year, view past years read-only
- [ ] Finance Head locked to current year
- [ ] Changing year clears unsaved edits
- [ ] Year labels: "{year} (current)", "{year} (from Oct 1)", past = "{year}"

## 3.2 Users tab — assigning staff
- [ ] Sections render: Signed-in no-assignment, In-directory no-assignment (count shown), Leaving, Profiles by Division > Department, Campus roles by University, Other
- [ ] Unassigned card: **Leaving** (trash) marks not-serving; **Assign** (person+) expands editor
- [ ] Assign a role + department → Save → user moves to correct section; toast "Saved {email}"
- [ ] Save disabled until assignments change
- [ ] "+ Add Assignment" adds rows; trash removes (min 1 unless head role exists)
- [ ] Head of Department/Division rows are locked (managed in Structure) with lock icon
- [ ] Edit existing profile; Delete profile → type-name-to-confirm → moves to "Leaving"
- [ ] Leaving section: "Move to unassigned" returns user to pool
- [ ] Unassigned sections hidden in past (read-only) years

## 3.3 Assignment validation
- [ ] Only one Director per year — second attempt: "A Director is already assigned for this year."
- [ ] Campus roles (Student Leader/President/VP/Executive) require a university that exists for the year
- [ ] Chaplain roles auto-use Chaplaincy department (must exist)
- [ ] Cannot strip all non-head roles unless a head role is held
- [ ] Duplicate assignments deduped; promoting to Head removes same-scope staff assignment

## 3.4 Structure — Roles
- [ ] List + "No roles yet." empty state; Add Role with non-empty name
- [ ] System roles (Head of Department/Division, Director, Staff, Member) cannot be renamed/deleted — the Roles list shows a 🔒 lock instead of edit/trash for them (source of truth: `SYSTEM_ROLES` / `isSystemRole` in `shared/flow.ts`; backend `updateRole`/`removeRole` also reject them)
- [ ] Rename role cascades across all staff assignments for the year
- [ ] Delete role blocked if anyone holds it: "[role] is still assigned to N person/people in YYYY…"
- [ ] Duplicate role name rejected

## 3.5 Structure — Divisions / Departments / Universities
- [ ] **Division:** add (optional head), rename cascades to child departments + staff; delete → type-to-confirm, cascades to departments + assignments, blocked if any child dept has open requests
- [ ] **Department:** add requires name + division; Add disabled until both filled; rename cascades to staff + open requests; delete blocked if open requests ("…still has open requests in YYYY…")
- [ ] **University:** add/rename/delete; rename cascades to campus assignments; "No universities yet." empty state
- [ ] Head change grants/revokes the Head role and preserves other assignments
- [ ] Duplicate name within a year rejected for each type

## 3.6 Other tab
- [ ] **Directory Sync:** shows last sync / "Never synced."; "Sync Directory Now" → confirm → "Syncing…" → timestamp updates (admins only)
- [ ] **Budget Manager:** select from Finance dept members → Set; non-Finance person rejected ("must be from the Finance department"); cannot unset; read-only in past years
- [ ] **Director Threshold:** numeric input, default shown as $5,000; Set disabled if ≤0 or unchanged; non-numeric stripped; positive-amount validation
- [ ] **Approver Delegation** (admins only): add From→To (must differ, both have profiles), idempotent; remove asks "Remove delegation?" confirm before deleting; "No delegations set." empty state
- [ ] Verify a delegate can approve/decline/pay on behalf of the covered approver (cross-check in Requests)

## 3.7 Cross-cutting
- [ ] Year isolation: structure created in one year not visible in another
- [ ] Loading spinners on Save buttons; error banner at top; clears on year change
- [ ] Email inputs require valid "@", stored lowercased/trimmed
- [ ] Type-to-confirm dialogs disable confirm until the name matches exactly

---

# 4. Cross-feature integration checks

- [ ] Admin creates a department → it becomes selectable when submitting a Request
- [ ] Admin sets the Budget Manager → that person sees Budget approvals in the Requests Review tab
- [ ] Admin raises the Director threshold → a borderline new request skips/includes the Director step accordingly
- [ ] Admin adds a campus → it appears as a subgroup in Attendance Events
- [ ] Deleting a department in Admin is blocked while it has open reimbursement requests
- [ ] Notifications (push + email + in-app bell) deep-link to the correct request/screen; "Mark all read" works

## 4.1 Notifications (in-app bell)
- [ ] Bell shows an **Unread** section and a separate **Read (history)** section; reading an item moves it from Unread → Read
- [ ] "Mark all read" empties the Unread section
- [ ] **Test every notification type** routes/deep-links correctly:
  - [ ] Request **submitted** (requester confirmation) → Mine, focused
  - [ ] **Approval needed** (next approver) → Review, focused on the request
  - [ ] **Approved / fully approved** → requester + prior approvers, Mine/Review
  - [ ] **Declined** (with reason) → requester + prior approvers
  - [ ] **Cancelled** → involved approvers
  - [ ] **Nudge** → whoever the request is waiting on
  - [ ] **Receipt submitted** → Finance Head, Ready to Pay
  - [ ] **Paid** → requester; **paid ≠ requested** → Budget Manager
  - [ ] **Comment** → current action owner, opens the comment thread (`&thread=1`)
  - [ ] **Attendance event** notifications → the event screen
- [ ] Push notification icon/branding shows the SHED logo (see `app.json` → `notification`/`icon`)

---

<!--
E2E run 2026-07-01 (web harness, dev deploy industrious-robin-425, account e2e-requester@sow.org.au).
Legend: [x] verified · ⏭️ deferred (needs admin role / server fault-injection / full approval chain — not browser-automatable with a single staff account) · ⚠️ finding.
-->

## 4.2 Org Chart tab
- [x] Org Chart tab is visible to signed-in users who should see it in the bottom tab bar
- [ ] Campus-leader users land on Attendance first but can still navigate to Org Chart — ⏭️ no campus-leader test account
- [x] Year picker appears when multiple years are available
- [x] Switching years reloads the chart and keeps the selected year label accurate
- [x] Current year and next-year labels are clear in the picker — current year shown; next-year is correctly hidden for non-admins
- [x] Director card renders the assigned Director with name, photo/avatar, and role tag
- [ ] Empty Director state shows "No Director assigned for {year} yet." — ⏭️ all tested years have a Director
- [ ] Staff section renders people who hold non-campus roles but are not in a division, department, or campus — ⏭️ not observed in current data
- [x] Division sections render with their division labels
- [x] Head of Division rows render separately from department members
- [x] Department cards render department name, Head of Dept, members, and department colour
- [ ] Empty department cards show "No members yet" when no head or members exist — ⏭️ no empty department in data
- [x] Campus section renders universities with members and university colours
- [ ] Universities with no members are hidden from the Campus section — ⏭️ couldn't construct an empty university
- [x] Tapping any person row opens `/person/[email]` for that person
- [x] Long names, emails, and role tags truncate cleanly without overlapping
- [ ] Chart updates after Admin changes assignments, heads, divisions, departments, or universities — ⏭️ needs admin account

## 4.3 Profile screen
- [x] Opening own profile shows name, email, avatar, current assignment, and current staff year
- [x] Profile photo fallback initials render when no photo exists
- [x] Camera action opens image picker for the signed-in user's own profile — camera affordance present
- [ ] Avatar upload succeeds and immediately updates the profile photo — ⏭️ web file injection not driven
- [ ] Avatar upload rejects an image larger than the configured upload limit with a clear error — ⏭️ needs oversize file injection
- [ ] Canceling image picker leaves the existing avatar unchanged — ⏭️ picker not driven
- [x] Local church field is editable on own profile
- [x] Save Church is disabled until the local church draft changes
- [x] Saving Local church persists and clears the dirty state
- [ ] Failed Local church save shows an error banner and preserves the typed value — ⏭️ needs server fault-injection
- [x] Service History renders all years in descending/expected order with assignment chips
- [x] Current service-history year is marked "current"
- [x] Profile with no assignment for the current year shows the no-assignment copy ("No assignment for {year}")
- [x] Viewing another person's profile through `/person/[email]` is read-only
- [x] Other-person profile hides own-profile-only controls such as avatar upload, Local church edit, and Sign out
- [x] Sign out opens confirmation before ending the session
- [x] Canceling sign out keeps the user signed in
- [x] Confirming sign out returns the user to the sign-in screen

## 4.4 Deep links and routed detail screens
- [x] Direct link to `/request/[id]` opens the correct request detail card — redirects to `/?tab=mine&focus=<id>` and focuses it
- [x] Invalid or missing request id shows a safe empty/error state rather than crashing — ✅ FIXED: `requests:get` now accepts a string and `normalizeId`s it, so a malformed id renders the "Request not found" empty state (no error boundary, no `/all` bounce)
- [ ] User without access to a request cannot view protected request details — ⏭️ needs a request owned by another user
- [x] Direct link to `/person/[email]` opens that person's profile
- [x] Invalid or unknown person email shows a safe empty/error state rather than crashing — graceful empty profile
- [x] Direct link to `/profile` opens the signed-in user's profile
- [x] Direct link to `/notifications` opens the notifications screen
- [ ] Direct link to `/attendance/event/[eventId]` opens the event sign-in screen — ⏭️ valid event id not tested
- [x] Invalid or missing event id shows a safe empty/error state rather than crashing — ✅ FIXED: `events:get` and `attendance:listByEvent` now `normalizeId` a string arg, so a malformed id renders the "Event not found" empty state (no error boundary, no `/all` bounce)
- [ ] Notification deep link for a request focuses or reveals the correct request — ⏭️ focus mechanism confirmed via `/request/[id]`; real notification not generated
- [ ] Notification deep link with `thread=1` opens the request's comment thread — ⏭️ no notification generated
- [ ] Attendance event notification deep link opens the correct event screen — ⏭️ no notification generated
- [x] Legacy `/review` redirect lands on Requests with the Review segment selected — `/?tab=review` (segment hidden for non-approver, degrades to Mine)
- [x] Legacy `/all` redirect lands on Requests with the All segment selected — `/?tab=all` (segment hidden for non-Finance, degrades to Mine)
- [x] Back navigation from each deep-linked detail screen returns to a sensible app screen
- [x] Deep links preserve auth requirements: signed-out users authenticate first, then land on the intended screen — auth gate confirmed (OAuth completion not driven)

## 4.5 Loading, empty, and error states
- [x] Initial app load shows a loading state until auth/profile data resolves
- [x] Requests, Attendance, Admin, Org Chart, Profile, and Notifications screens show loading states while their primary queries resolve — observed on Requests/Org/Profile; not all screens individually timed
- [x] Empty Mine, Review, All, Attendance Events, Members, Audit, Admin lists, Org Chart sections, Bank accounts, and Notifications states show the expected copy — verified Mine, Notifications, Bank, no-assignment profile; others not visited
- [ ] Mutation buttons show saving/uploading/syncing labels while the operation is in flight — ⏭️ not isolated (operations completed too fast)
- [ ] Mutation buttons are disabled while submitting to prevent duplicate actions — ⏭️ needs in-flight observation
- [x] Top-level error banners appear when mutations fail — server validation error (addAccount name-required) surfaced to the UI
- [ ] Error banners clear after a successful retry or when the user changes context where implemented — ⏭️ not isolated
- [ ] Optimistic request approval/decline/comment reactions roll back or recover cleanly if the server rejects the mutation — ⏭️ needs server fault-injection
- [ ] Optimistic bank account delete/preferred-account updates roll back or show a recoverable error if the server rejects the mutation — ⏭️ needs server fault-injection
- [ ] Failed receipt/avatar file upload surfaces an actionable error and leaves the form usable — ⏭️ needs fault-injection
- [ ] Failed directory sync shows an error and allows retry — ⏭️ admin-only + fault-injection
- [ ] Failed attendance sign-in/sign-out leaves the attendee in a consistent list state — ⏭️ needs fault-injection
- [ ] Pagination "Load more" controls show progress and recover after a failed load — ⏭️ needs long lists / fault-injection
- [x] Screens with no profile or insufficient role show the correct access/empty state instead of a blank screen — non-Finance/non-approver gating degrades gracefully

## 4.6 Bank tab
- [x] Bank tab is visible to all signed-in users with a profile
- [x] Empty state prompts the user to add bank details
- [x] Add Bank Details opens the bank-account form
- [x] Account Name is required — server-enforced (Convex throws, UI surfaces "Account name is required.")
- [x] BSB accepts digits only and rejects non-digit characters
- [x] Account Number accepts digits only and rejects non-digit characters
- [x] Adding the first account marks it as preferred
- [x] Adding another account keeps the existing preferred account unless "make preferred" is selected
- [x] Preferred account is visually marked with the star indicator
- [x] Selecting the star on a non-preferred account makes it preferred
- [x] Editing an account pre-fills the form with existing values
- [x] Saving edits updates the account without creating a duplicate
- [x] Canceling add/edit leaves the account list unchanged
- [x] Deleting a non-preferred account asks for confirmation and removes it
- [x] Deleting the preferred account shows copy explaining it is the auto-filled account
- [ ] Deleting the preferred account removes the auto-fill source and keeps remaining accounts usable — ⏭️ partial (only one account present at that point)
- [x] Add Another Account button appears once at least one account exists
- [x] Bank account validation errors remain visible until corrected
- [ ] Preferred account auto-fills receipt recipient fields in Submit Receipt — ⏭️ needs a request in AWAITING RECEIPT (full HOD→Budget→Finance approval chain)
- [ ] Removing/forgetting a saved account from the receipt flow updates the Bank tab list on return — ⏭️ same as above

---

## Notes / known issues to keep an eye on
- ✅ **Attendance Audit pagination crash** when filtered/searched (multi-paginate) — **fixed** (CHANGELOG → Unreleased); kept here as a regression watch.
- ✅ **Tag "save all" audit spam** — **fixed** (only changed tags are now logged); kept here as a regression watch.
