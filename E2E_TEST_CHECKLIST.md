# The Shed Mobile — End-to-End Test Checklist

Covers every user-facing action in the app as of **v1.7.1**. Written to be translated
directly into [Maestro](https://maestro.mobile.dev) flows — each checkbox is one
assertable step or scenario. Replace/regenerate this file when the app's surface changes.

**Conventions used throughout:**
- "Staff year" = Oct 1 → Sep 30 rollover (e.g. an event on 15 Jan 2026 belongs to staff year 2025).
- "Calendar year" = Jan–Dec (used only for the student **Year** metadata field).
- "Visitor" = not signed in. "Staff" = signed in with a staff profile. "Campus leader" = signed in whose only roles are campus roles.
- Test with multiple accounts/roles where noted (visitor, plain staff, campus leader, HOD, Budget Manager, Director, Finance Head, admin).

**Maestro notes:**
- The app has almost **no `testID`s**; target elements by visible text or the ~85 `accessibilityLabel`s (e.g. "Open admin tools"). Add testIDs where flows get flaky.
- Deep-link scheme: `theshedmobile://` (plus https universal links). Use `openLink` for the deep-link section.
- Multi-account flows need scripted sign-in with Google OAuth (`ASWebAuthenticationSession`) — consider a dev-only auth bypass or pre-authenticated test builds; first cold sign-in has a known grace-window retry path (see 2.2).
- Backend is Convex (live queries) — UI updates arrive reactively; prefer `assertVisible` with timeouts over fixed sleeps.
- Test builds show a "Test Environment" chip (see 12.5); emails from the dev backend link to the dev web build.

---

# 0. App launch & tab gating

The bottom tab bar is role-gated. Admin is **never** a bottom tab — it opens via the
"Open admin tools" Admin bar (Org Chart tab, and Requests → All page).

| Tab | Visitor | Campus leader | Plain staff | Admin / Finance Head |
|---|---|---|---|---|
| Home | ✅ | hidden (logo → Home) | hidden (logo → Home) | hidden (logo → Home) |
| Requests | hidden | hidden | ✅ | ✅ |
| Attendance | hidden | ✅ | ✅ | ✅ |
| Insights (BETA badge) | ✅ (General only) | ✅ | ✅ | ✅ |
| Org Chart | ✅ | ✅ | ✅ | ✅ |

- [ ] Cold launch as a **visitor** lands on the public **Org Chart**
- [ ] Visitor tab bar shows exactly: Home, Insights, Org Chart (no Requests/Attendance; no notifications bell)
- [ ] Signed-in **campus leader** launch redirects `/` → Attendance; no Requests tab
- [ ] Signed-in **plain staff** sees Requests, Attendance, Insights, Org Chart (no Home tab)
- [ ] Insights tab icon shows the small **BETA** flag
- [ ] Requests tab icon badge = action-required count + unread-message count across Mine + Review; caps at "99+"
- [ ] Tapping the top-left "THE SHED" logo goes to the **Home** tab (not Requests) — from any tab, signed in or out
- [ ] Admin bar ("Open admin tools") visible on Org Chart only for admins / the Finance Head
- [ ] Visitor deep-linking into a staff-only tab is sent to the Org Chart

---

# 1. Public experience (signed out)

## 1.1 Home tab (4 swipeable pages)
- [ ] **Home** page: SOW mission & values content; volunteer info; links to Instagram, Facebook, LinkedIn, Spotify, sow.org.au, and Email (each opens externally / mail client)
- [ ] **Resources** page: helpful websites, Christian psychologists, helplines; helpline numbers are **tap-to-call**
- [ ] **Connect** page: four university societies in campus colours; Weekly Meeting explainer; campus meetup link (sow.org.au/students)
- [ ] **Partner** page: Pray / Give / Volunteer sections; newsletter sign-up link (sow.org.au/subscriptions); Donate link
- [ ] **Contact us form** (Partner): valid email + message ≥ 2 chars submits successfully
- [ ] Contact validation — invalid email: "Please enter a valid email address."
- [ ] Contact validation — empty message: "Please enter a message."; > 5000 chars: "…a little too long…"
- [ ] Contact rate limit — 4th submission within an hour blocked: "…wait an hour before sending another."
- [ ] Signed-in submitter's email is locked to their account address (cannot spoof sender)

## 1.2 Public Org Chart & profiles
- [ ] Visitor can browse the full org chart and open any person's profile / service history
- [ ] Signed-out person view **hides the Local church field** (private)
- [ ] Pre-provisioned next staff year is **not** offered to visitors in the year picker (admin-only)

## 1.3 Public Insights
- [ ] Visitor's Insights shows only the **General** segment (single segment, no Attendance)
- [ ] Visitor gets **no** bottom-right selector FAB (General shows All-years view only)

## 1.4 Sign-in
- [ ] Top-right avatar → "Sign in with Google" starts OAuth; sow.org.au account succeeds
- [ ] After sign-in, staff tools appear **in place** (no relaunch needed); bell appears
- [ ] Profile photo / name load from directory after sign-in

---

# 2. Auth edge cases

- [ ] First cold Google sign-in completes even when the auth session dismisses before the `theshedmobile://…?code=` deep link arrives (grace-window recovery — should NOT need a second tap)
- [ ] Sign out (Profile → Sign out) asks for confirmation; cancel keeps session; confirm returns to public app
- [ ] Deep link while signed out → authenticate first, then land on the intended screen
- [ ] Missing `EXPO_PUBLIC_CONVEX_URL` build shows the "Configuration error" screen (not a blank screen) — build-config test, not a Maestro flow

---

# 3. REQUESTS (Reimbursement)

> Lifecycle: `AWAITING APPROVAL → AWAITING RECEIPT → AWAITING PAYMENT → PAID` (or `DECLINED` at any approval step).
> Approval chain: **HOD → Budget Manager → Director (only if amount ≥ threshold, default $5,000) → Finance Head**.
> Top segments: **Mine · Review · All · Bank**.

## 3.0 Segment navigation & no-profile state
- [ ] Segments are a **swipeable carousel** — swiping left/right moves between Mine / Review / All / Bank, in sync with the segment strip
- [ ] The "+ Make Request" footer slides down out of view when swiping away from Mine and back up on return
- [ ] Scrolling to the end of the All segment triggers its load-more
- [ ] ⓘ info button on the "+ Make Request" footer opens the **"How it works" guide sheet** — 7 steps (Submit → HOD → Budget Manager → Director → Finance Head → Receipt → Payment) with the **live Director threshold** in the Director step
- [ ] Signed-in user **without a profile** sees the welcome card: "No role or department is assigned to {email} for {year} yet. Ask an admin (Data and IT or Human Resources)…" + a Sign out button (no blank screen)

## 3.1 Segment visibility & badges
- [ ] **Mine** visible to all staff with a profile
- [ ] **Review** visible only to approvers
- [ ] **All** visible only to Finance **department members** (`me.isFinance` — anyone in the Finance department, not just the Finance Head)
- [ ] **Bank** visible to all staff
- [ ] Mine badge = count needing my action; Review badge = pending + **unread comments on reviewed requests**; All badge = unread comments across the year (Finance)

## 3.2 Submit a request
- [ ] **+ Make Request** opens the new-request sheet from Mine
- [ ] Department defaults to HOD's dept (or first assigned dept)
- [ ] Valid Description + positive Amount + Department → `AWAITING APPROVAL`, appears in Mine
- [ ] Validation fires in **on-screen order**: empty Description first ("Please describe what the request is for."), then Amount ("Amount must be a positive number."), then Department ("Pick a department for this request.")
- [ ] Submitting into a role that doesn't exist for the year blocked with "[year] has no [role]"
- [ ] Requester gets a "Request submitted" email (no push for own action)
- [ ] Cancelling the sheet keeps the draft; reopening resumes it (draft clears on submit)

## 3.3 Auto-approval rules
- [ ] Requester **is** the dept HOD → HOD step auto-approves
- [ ] Requester is Director or Head of Division → HOD step auto-approves
- [ ] Finance department requests skip the HOD step entirely
- [ ] Requester is Budget Manager → Budget step auto-approves; is Director → Director step auto-approves
- [ ] Requester filling every approver role → straight to `AWAITING RECEIPT`
- [ ] **Auto-approved steps appear in the approver's Reviewed history** (1.6.12 regression watch)

## 3.4 Approval workflow (Review)
- [ ] Pending requests grouped under "Awaiting Your HOD / Budget / Director / Finance Head Approval"
- [ ] **Approve** → confirmation modal → moves to next step; next approver notified (push + email)
- [ ] Final approval → `AWAITING RECEIPT`; requester + all prior approvers notified
- [ ] **Decline** requires a non-empty reason — inline "Please give a reason…" prompt (no raw server error)
- [ ] Decline → `DECLINED`; requester (with reason) + prior approvers notified
- [ ] Actioned requests appear in the collapsible **Reviewed** section (max 50)
- [ ] **Receipt-waiting requests stay visible** to the approver who cleared them (1.6.9 regression watch)
- [ ] Cannot approve own request: "You can't review your own request."
- [ ] Cannot approve out of order (prior steps must be approved)

## 3.5 Director threshold
- [ ] Amount **below** threshold skips the Director step; **≥** threshold requires it
- [ ] Changing the threshold in Admin affects new requests accordingly

## 3.6 Receipt submission (requester, after full approval)
- [ ] Cloud-upload icon opens **Submit Receipt**
- [ ] Add recipient: Account Name, BSB (digits only), Account Number (digits only), positive amount, ≥1 file
- [ ] **Preferred bank account auto-fills** recipient fields; saved-account chips fill on tap; **×** forgets the account (Bank tab updates on return)
- [ ] "Save Account for Future Use" toggle hidden/disabled when already saved
- [ ] Validation: no account name / non-digit BSB-account / no file — each blocked with its message
- [ ] File > 2MB rejected; filename > 200 chars rejected; >10 files per recipient / >50 total / >20 recipients rejected
- [ ] Receipt total > requested amount → "Submit anyway?" confirmation (not a hard error)
- [ ] Submit → `AWAITING PAYMENT`; Finance Head notified

## 3.6a Viewing a submitted receipt
- [ ] Expanded request card shows each recipient's bank details and receipt files as **tappable links** (signed URLs — open/download)
- [ ] Receipt files visible to the requester, approvers and Finance on the same card
- [ ] Files purged by the Oct 1 retention cron show their name marked as deleted (link disabled, no crash)

## 3.7 Payment (Finance Head)
- [ ] Receipt-submitted requests appear under **Ready to Pay**
- [ ] **Mark as paid** opens Pay Reimbursement with read-only receipt details
- [ ] Positive paid amount (+ optional comment) → `PAID`; requester notified
- [ ] Paid ≠ requested → Budget Manager notified of the difference
- [ ] Paid ≤ 0 blocked: "The paid amount must be a positive number."
- [ ] Only Finance Head (or delegate) can pay

## 3.8 Requester actions
- [ ] **Cancel** (trash) an in-flight request → confirm → deleted; involved approvers notified
- [ ] **Delete** a declined request → confirm → deleted (no notifications)
- [ ] **Resubmit** (refresh) a declined request → sheet pre-filled with original description/amount/dept
- [ ] **Nudge** (hand icon) → reminder to whoever it's waiting on
- [ ] Nudge cooldown blocked within 24h; copy always `Xh Ym` (e.g. "24h 0m", "5h 23m")
- [ ] Cannot nudge when waiting on yourself / already completed

## 3.9 Comments
- [ ] Chat-bubble icon opens the thread on any request
- [ ] Adding a comment notifies the current action owner
- [ ] Unread badges (chat icon + segment + tab) increment and clear on read
- [ ] Emoji reactions work
- [ ] Composer stays pinned above the keyboard; thread stays scrolled to the newest comment (open, post, keyboard-open all keep composer visible)
- [ ] The "+ Make Request" footer behind the sheet does **not** ride up when the sheet's keyboard opens

## 3.10 All segment (Finance) & sorting
- [ ] Segmented control: **Ongoing** vs **Completed**
- [ ] Ongoing sorts by unread comments → status priority → date
- [ ] Completed paginated (20 at a time, infinite scroll)
- [ ] Floating year picker (All segment only) lets Finance browse prior years (back to 2021), read-only, with prior-year receipt-deletion warning copy; prior-year Mine view shows "No requests in {year}" when empty
- [ ] Carry-over: incomplete prior-year request still appears in Mine/All; original-year approvers **and** current officeholders can action it
- [ ] Admin bar ("Open admin tools") on the All page opens Admin **with the Other tab preselected** (Budget Manager + threshold)
- [ ] **Export requests CSV** card on the All page: multi-select Years → "Export requests?" confirm → Download CSV with the selected years' requests

## 3.11 Empty states
- [ ] Mine: "No requests yet" + make-request hint · Review: "All caught up" · All Ongoing/Completed: correct copy

---

# 4. Bank tab

- [ ] Empty state prompts to add bank details; Add Bank Details opens the form
- [ ] Account Name required (server-enforced, surfaced as "Account name is required.")
- [ ] BSB / Account Number digits-only, non-digits rejected; errors stay visible until corrected
- [ ] First account auto-marked preferred (star); adding another keeps existing preferred unless "make preferred" selected
- [ ] Tapping the star on a non-preferred account makes it preferred
- [ ] Edit pre-fills; save updates without duplicating; cancel leaves list unchanged
- [ ] Delete non-preferred → confirm → removed; deleting preferred shows auto-fill explanation copy and leaves remaining accounts usable
- [ ] "Add Another Account" appears once ≥1 account exists
- [ ] Preferred account auto-fills Submit Receipt recipient fields (cross-check 3.6)

---

# 5. ATTENDANCE

> Sub-tabs: **Events · Members · Tags · Metadata · Audit** (Insights moved to its own bottom tab).
> Members & metadata are year-less; events/tags are keyed by staff year.

## 5.1 Events tab
- [ ] Campus/subgroup ring selector shows all groups, highlights selection; "No groups yet" when no campuses exist
- [ ] Event list sorted within the staff year; badge cycles UPCOMING → LIVE → ENDED (~every 60s); LIVE green, ENDED greyed
- [ ] Card shows date/time range, "ATTENDANCE: N", tag pills, subgroup pills (collaborative)
- [ ] "Load more" paginates; tapping a card opens the sign-in screen
- [ ] Edit (pencil) opens the event form; Export opens the Export sheet
- [ ] Group chips label non-campus staff roles as **STAFF**

## 5.1a Subgroup events screen (`/attendance/[subgroup]`)
- [ ] Standalone screen listing one sub-group's events newest-first (route-only — reachable by deep link)
- [ ] "Create an event to take attendance." empty state
- [ ] Footer action opens the **full-screen create-event route** (`/attendance/event/new`) with the sub-group preselected
- [ ] Pagination and event-card taps behave the same as the Events tab

## 5.2 Create / edit event (4-step wizard)
- [ ] Step 0 Name — Next disabled until entered
- [ ] Step 1 Tags — only tags applicable to selected collaborators; "Add tags in Tags first" when none
- [ ] Step 2 Collaboration — owner group locked; other groups toggleable
- [ ] Step 3 Schedule — **defaults to today, 5–7pm**; date `YYYY-MM-DD`, times `HH:MM`, invalid format errors
- [ ] End ≤ start → auto-extended +2h
- [ ] "Weekly Meeting" tag pre-fills next matching weekday + slot times
- [ ] Cancelling a **new** event closes without confirm and keeps the draft; reopening resumes it (no stacked-modal freeze — 1.6.7 regression watch)
- [ ] Switching attendance groups **resets** the new-event draft
- [ ] Editing an existing event: Save disabled until dirty; cancel with unsaved changes → "Discard changes?" (dialog dismisses before the sheet)
- [ ] Delete event → type-name-to-confirm; deletes event + all attendance records
- [ ] Date/time spinner (wheel) pickers respond to taps and drags (1.6.3 regression watch)

## 5.3 Event sign-in screen (roll-call)
- [ ] Header count chip ("N signed in") updates optimistically
- [ ] Event can be **edited from within the sign-in screen** (opens the same edit sheet as the Events tab pencil)
- [ ] Search filters both lists by **name, email, roles and member details** (same fields as Members tab)
- [ ] **Swipe left** not-signed-in row → signs in; swipe left signed-in row → signs out
- [ ] **Tap** a row to reveal the arrow, then tap the arrow → also signs in/out
- [ ] **Swipe right** any row → Edit Member sheet; failure to open shows an error toast
- [ ] Not-signed-in list ordered by attendance frequency; "Everyone in the pool is signed in 🎉" when empty
- [ ] Signing in the same person twice is idempotent
- [ ] Notes field in edit sheet only for signed-in attendance
- [ ] "Create [search text]" footer creates a member and signs them in
- [ ] "Load more" works on both lists
- [ ] Staff subtitles don't double the role ("President · President" bug — regression watch)
- [ ] **Multi-user sync:** sign-in/out on device A animates on device B

## 5.4 Past / ended event editing
- [ ] Ended event shows "This event has ended…" banner + **Enable editing** (with confirmation)
- [ ] Edit / sign-in / sign-out disabled until unlocked; after unlock can sign in a missed attendee
- [ ] Attendees who signed in **during** the event cannot be signed out (row locked/greyed)

## 5.5 Members tab
- [ ] Search (400ms debounce) + clear; search bar and filters pin to the top while scrolling
- [ ] Filter panel: Sort by (Name or metadata), Asc/Desc, metadata select filters, "Clear All", active count; pagination resets on change
- [ ] **Staff filter bucket matches custom roles** (any non-campus role other than Member — 1.6.13 regression watch)
- [ ] Unresolvable stored Year values match **"Unselected"** (don't vanish — 1.6.13 regression watch)
- [ ] Staff + Student Leader filters don't double-count a person who is both a profile and a member row
- [ ] Sorting by a select field orders by **labels**, not option ids
- [ ] "TOTAL: N" reflects all members (not the filtered subset)
- [ ] Row tap opens Edit Member; staff row with no member row yet ensures-for-staff then opens
- [ ] Campus pill shows university colour / "STAFF" / "OTHER"; avatar from profile or placeholder
- [ ] "No members match" empty state

## 5.6 Edit member sheet
- [ ] Create: name required, email optional, metadata fields shown
- [ ] Duplicate name on create → "A member with this name already exists. Add anyway?"
- [ ] Edit: pre-filled; save updates
- [ ] Delete → type-name-to-confirm; removed from pool
- [ ] Student **Year** shows calendar year at viewing time; dropdown offers 1–15
- [ ] **Staff-overlay member** (email matches a staff profile): name, email and the locked Campus/Role fields are **disabled** (sourced from the staff profile); other metadata still editable and saveable

## 5.7 Tags tab
- [ ] Add tag → blank card; name editable; colour picked from the **sheet-style colour selector** (blue/purple/pink/red/orange/yellow/green/teal)
- [ ] "Applies to" scope — must keep ≥1 subgroup
- [ ] Delete existing tag → type-name-to-confirm; unsaved new tag discards via close icon
- [ ] **Save tags** disabled when clean; "Saving…" while in flight; "unsaved changes" note; discard confirms
- [ ] Tag order preserved across reload
- [ ] Saving logs **only changed tags** to Audit (regression watch)

## 5.8 Metadata tab
- [ ] Locked fields (Year, Gender, Campus, Role) read-only, undeletable, options locked
- [ ] Select fields: add/remove options; input fields have no option editor
- [ ] Drag to reorder; add field (select/input); delete field → type-name-to-confirm
- [ ] Subgroup scope: global or specific subgroups
- [ ] Saved field appears in the member edit sheet; metadata shared across staff years
- [ ] Adding/deleting a field logs only real changes — no "Updated Campus/Role" or bogus "Reordered" audit spam (1.6.11 regression watch)

## 5.9 Audit tab
- [ ] Immutable list with entity icons, actor, time-ago ("just now", "Xm ago", "Xh ago", "Xd ago", "24 Jun")
- [ ] Actor names resolve for legacy-domain emails (@sowaustralia.com ↔ @sow.org.au)
- [ ] Search (400ms debounce) matches summary/detail **and the person acted on** (e.g. who was signed in)
- [ ] Filters: Action type / Performed by / Event, AND-combined; "Clear All"; active count
- [ ] "Load more" paginates — **including while filtered/searched** (multi-page paginator crash — regression watch)

## 5.10 Export
- [ ] Group export: date-range (spinner pickers, no overlay spill) + tag filters + metadata checkboxes
- [ ] Event export: single event + metadata checkboxes
- [ ] CSV always includes Sign In, Name, Email + locked fields; **Notes** (per-sign-in note) is selectable and appears exactly once — a metadata field named "Notes" is excluded
- [ ] CSV Year column = year level **at the time of the event**, uncapped (6, 7, 8…)
- [ ] Filename slug correct; special characters escaped; empty result handled gracefully

## 5.11 Year scoping (spot-check)
- [ ] Events dated Oct 1 2025 / Dec 25 2025 / Jan 15 2026 / Sep 30 2026 → staff year 2025; Oct 1 2026 → 2026
- [ ] Members/metadata identical across staff years

---

# 6. INSIGHTS (bottom tab, BETA)

> Two top segments: **General** (public org-wide trends) · **Attendance** (staff-only per-campus dashboard).
> Bottom-right selector FAB is per-segment: year scope on General; range + collaborative toggle on Attendance.
> Snapshots auto-refresh (weekly full + 15-min dirty recompute) — no manual refresh control.

## 6.1 General segment
- [ ] Defaults to General on first load
- [ ] Trend charts (All years): total staff head-count, staff vs student leaders, student leaders by campus
- [ ] **Weekly meeting attendance** chart: per-campus averages from 2025; current year = year-to-date; follows the bars/lines toggle (bar mode = side-by-side per campus)
- [ ] Scope FAB switches All years ↔ specific staff year; specific year shows summary cards with change vs previous year + per-campus weekly-average comparison cards
- [ ] Staff trend counts custom-role holders as staff (1.6.13 regression watch)

## 6.2 Attendance segment (staff only)
- [ ] Sub-group selector defaults from the user's assignments
- [ ] Summary cards: average attendance (+change vs previous period), events held, unique attendees, newcomers, follow-up count, weekly-meeting consistency score
- [ ] Trend charts: attendance over time, rolling average, weekly-meeting trend, unique attendees by month, Campus/Role breakdowns
- [ ] **New vs returning** and **Student leaders vs everyone else** shown only for individual campuses (hidden on SOW view)
- [ ] **This campus vs visitors** chart per campus (hidden on SOW); share/ratio line in subtitle; only people with a known home campus counted
- [ ] SOW view: average weekly attendance by campus chart; **no** "Needs follow-up" list
- [ ] "Needs follow-up" list (per campus) shows explainable reasons ("Missed the last 3 weekly meetings", "Newcomer: …", "Returned after…")
- [ ] Range FAB: 1 / 2 / 4 / 8 / 12 weeks (**default 2**) + "Collaborative events" toggle
- [ ] New roll-call data reflected within minutes (dirty recompute)

## 6.3 Chart interactions (both segments)
- [ ] Bar charts have a left y-axis (max/75%/50%/25%/0); line charts use a uniform "nice" y-axis
- [ ] X-axis year labels shortened ('24) with skip-logic — no overlap on long runs
- [ ] Campus legend uses acronyms (ACU, MACQ, UNSW, USYD, UTS)
- [ ] Tap a chart card → fullscreen (portrait phone rotates to landscape; web/landscape fills naturally)
- [ ] In fullscreen, tap a bar → tooltip pill with value(s) + year (multi-value with colour dots for stacked charts)
- [ ] Chart container height stable as selection changes (no jumping)

---

# 7. ORG CHART

- [ ] Tab visible to everyone (public); campus leaders can reach it after their Attendance redirect
- [ ] Year picker when multiple years exist; switching reloads the chart with the correct label
- [ ] Next staff year offered **only to admins**, labelled "· Next year"
- [ ] Director card at top with name, photo/avatar, role tag; "No Director assigned for {year} yet." when empty
- [ ] Staff section = people with non-campus roles outside any division/department/campus
- [ ] Division sections with labels; Head of Division rows separate from department members
- [ ] Department cards: name, Head of Dept, members, colour; "No members yet" when empty
- [ ] Campus section: universities with members in university colours; member-less universities hidden
- [ ] Staff photos from the weekly Google sync show before first sign-in; own upload takes precedence
- [ ] Tapping a person opens `/person/[email]`
- [ ] Long names/emails/role tags truncate cleanly
- [ ] Chart updates reactively after Admin changes assignments/heads/structure

---

# 8. PROFILE & PERSON

- [ ] Own profile: name, email, avatar, current assignment, current staff year
- [ ] Fallback initials when no photo
- [ ] Camera action opens the picker; upload updates the photo immediately; >2MB → "Image is too large. Please choose one 2MB or less."; cancel leaves avatar unchanged
- [ ] Local church editable; Save disabled until dirty; save persists and clears dirty state
- [ ] Service History: all years descending with assignment chips; current year marked "current"
- [ ] No assignment for current year → "No assignment for {year}"
- [ ] Other person via `/person/[email]` is read-only — no avatar upload, Local church edit, or Sign out
- [ ] Chaplaincy roles read "Intern Chaplain → USYD" (no redundant "Chaplaincy ·" department)
- [ ] Sign out confirmation flow (see 2)

---

# 9. ADMIN

> Reached via the **Admin bar** on Org Chart (and finance settings from Requests → All) — not a bottom tab.
> Tabs: **Users, Structure (Roles/Divisions/Departments/Universities), Other**.
> Admin = Director, Head of HR division, Data & IT dept, or any dept under HR. Finance Head sees only **Other**.
> Source of truth: `isAdminProfile` in `convex/model.ts` + `ADMIN_DEPARTMENTS`/`ADMIN_DIVISIONS` in `shared/flow.ts`.

## 9.1 Access & year picker
- [ ] Non-admins get "Only admins can access this screen."; Finance Head sees only Other
- [ ] Year picker: admins edit current + next year, past years read-only; Finance Head locked to current
- [ ] Changing year clears unsaved edits
- [ ] Labels: "{year} (current)", "{year} (from Oct 1)", past = "{year}"

## 9.2 Users tab — assigning staff
- [ ] Sections render: Signed-in no-assignment, In-directory no-assignment (count), Leaving, Profiles by Division > Department, Campus roles by University, Other — **Director at the top**, no doubled accent stripe
- [ ] Unassigned card: **Leaving** (trash) marks not-serving; **Assign** (person+) expands the editor
- [ ] Assign role + department → Save → user moves to the correct section; toast "Saved {email}"
- [ ] Save disabled until assignments change
- [ ] "+ Add Assignment" adds rows; trash removes (min 1 unless a head role exists)
- [ ] Head of Department/Division rows locked (managed in Structure) with lock icon
- [ ] Edit existing profile; Delete → type-name-to-confirm → moves to "Leaving"; Leaving → "Move to unassigned" returns to pool
- [ ] Unassigned sections hidden in past (read-only) years

## 9.3 Assignment validation
- [ ] Second Director: "A Director is already assigned for this year."
- [ ] Campus roles require a university existing for the year; Chaplain roles auto-use Chaplaincy dept (must exist)
- [ ] Cannot strip all non-head roles unless a head role is held
- [ ] Duplicates deduped; promoting to Head removes same-scope staff assignment

## 9.4 Structure — Roles
- [ ] List + "No roles yet."; Add Role with non-empty name; duplicate name rejected
- [ ] System roles (Head of Department/Division, Director, Staff, Member) show a 🔒 lock — no edit/trash (UI + backend both guard; `SYSTEM_ROLES` in `shared/flow.ts`)
- [ ] Rename cascades to all staff assignments for the year
- [ ] Delete blocked while held: "[role] is still assigned to N person/people in YYYY…"

## 9.5 Structure — Divisions / Departments / Universities
- [ ] **Division:** add (optional head); rename cascades to child departments + staff; delete → type-to-confirm, cascades, blocked if a child dept has open requests
- [ ] **Department:** Add disabled until name **and a valid division** set (deleted division can't linger selected); rename cascades to staff + open requests; delete blocked with open requests
- [ ] **University:** add/rename/delete; rename cascades to campus assignments; "No universities yet."
- [ ] Head change grants/revokes the Head role, preserving other assignments
- [ ] Duplicate names within a year rejected per type

## 9.6 Other tab
- [ ] **Budget Manager:** select from Finance members → Set; non-Finance rejected; cannot unset; read-only in past years
- [ ] **Director Threshold:** default $5,000 shown; Set disabled if ≤0 or unchanged; non-numerics stripped
- [ ] **Approver Delegation** (admins only): add From→To (must differ, both profiled), idempotent; remove asks "Remove delegation?"; "No delegations set." empty state
- [ ] Delegate can approve/decline/pay on behalf of the covered approver (cross-check in Requests)
- [ ] **Directory Sync** sits at the **bottom** of the section: last-sync / "Never synced."; "Sync Directory Now" → confirm → "Syncing…" → timestamp updates (admins only)

## 9.7 Cross-cutting
- [ ] Year isolation: structure created in one year invisible in another
- [ ] Save spinners; top error banner; clears on year change
- [ ] Emails require "@", stored lowercased/trimmed
- [ ] Type-to-confirm dialogs disable confirm until exact match

---

# 10. NOTIFICATIONS

## 10.1 In-app bell
- [ ] Bell hidden for visitors; badge counts unread
- [ ] Feed grouped into **Unread** and **Read** section headers; reading moves items Unread → Read
- [ ] "Mark all read" empties Unread
- [ ] **Stale-request reminders** (daily cron) appear in the feed with unread badge

## 10.2 Routing per type
- [ ] Request **submitted** → Mine · **Approval needed** → Review · **Approved / fully approved** → requester + prior approvers · **Declined** (with reason) · **Cancelled** → involved approvers · **Nudge** → current owner
- [ ] Request notifications land on the relevant **segment** (Mine for requester, Review for approvers/Finance)
- [ ] **Comment** → focuses the request AND opens its thread (`&focus=…&thread=1`) (1.6.3 regression watch)
- [ ] **Receipt submitted** → Finance Head, Ready to Pay · **Paid** → requester · paid ≠ requested → Budget Manager
- [ ] **Attendance event** notifications → the event screen
- [ ] Opening the request clears its notification (link carried by `requestId`)

## 10.3 Push
- [ ] Push registration runs after sign-in (OS permission prompt on first run); declining leaves in-app + email notifications working
- [ ] Push tap follows only known in-app screens; malformed/unexpected links ignored
- [ ] Request push deep-links via `/?tab=…&focus=…` (allow-list in `shared/deepLinks.ts` — regression watch)
- [ ] Push icon/branding shows the SHED logo (`app.json` → `notification`)
- [ ] Emails include "Open in THE SHED" links pointing at the sending deployment's own web build

---

# 11. DEEP LINKS & ROUTED SCREENS

- [ ] `/request/[id]` → redirects to `/?tab=mine&focus=<id>` and focuses the request
- [ ] Malformed/unknown request id → "Request not found" empty state (no crash, no `/all` bounce)
- [ ] User without access to a request cannot view its details
- [ ] `/person/[email]` opens that profile; unknown email → graceful empty profile
- [ ] `/profile` and `/notifications` open directly
- [ ] `/attendance/event/[eventId]` opens the sign-in screen; malformed id → "Event not found" empty state
- [ ] `/attendance/[subgroup]` opens that sub-group's events list; unknown subgroup handled gracefully
- [ ] `/attendance/event/new` opens the full-screen create-event flow
- [ ] Legacy `/review` → Requests Review segment; `/all` → All segment; both degrade to Mine when the segment is hidden for that role
- [ ] Visitors deep-linking to staff tabs → Org Chart
- [ ] Back navigation from every deep-linked screen returns to a sensible app screen

---

# 12. CROSS-CUTTING

## 12.1 Cross-feature integration
- [ ] Admin creates a department → selectable when submitting a Request
- [ ] Admin sets Budget Manager → they see Budget approvals in Review
- [ ] Admin raises threshold → borderline new request skips/includes Director accordingly
- [ ] Admin adds a campus → appears as an Attendance subgroup and in Insights
- [ ] Deleting a department blocked while it has open requests
- [ ] Roll-call change → Insights snapshot refreshes within minutes

## 12.2 Loading / empty / error states
- [ ] Initial load shows a loading state until auth/profile resolves
- [ ] Every main screen shows a loading state while its primary query resolves
- [ ] Every list's empty copy renders (Mine, Review, All, Events, Members, Audit, Admin lists, Org sections, Bank, Notifications, Insights no-data)
- [ ] Mutation buttons show saving/uploading/syncing labels and are disabled in flight (no double-submits); **disabled footer buttons stay solid**, not translucent
- [ ] Top-level error banners on failed mutations; clear on retry/context change
- [ ] Optimistic actions (approve/decline/comment/reactions, bank edits, sign-in/out) roll back or surface a recoverable error on server rejection *(needs fault injection — not Maestro-automatable)*
- [ ] Failed file upload (receipt/avatar) surfaces an actionable error and leaves the form usable
- [ ] "Load more" shows progress and recovers after a failed page
- [ ] No-profile / insufficient-role screens show access copy, never a blank screen
- [ ] A render error shows the root ErrorBoundary fallback, not a blank screen/crash

## 12.3 Keyboard & chrome
- [ ] Pinned footers stay put while a modal's keyboard is open; follow the keyboard on their own screens (e.g. event member search)
- [ ] Option sheets keyboard-avoid (KeyboardAvoidingView)
- [ ] Top chrome (logo/avatar row) collapses on scroll down, reappears scrolling up, stays flush with pinned search bars; tab switches keep per-tab collapse state
- [ ] Tags/Metadata footers align with the "+ Make Request" footer height

## 12.4 Multi-user real-time sync
- [ ] Roll-call sign-in/out syncs between two devices live
- [ ] Request approval on device A updates the requester's Mine list on device B
- [ ] Admin structure change updates the Org Chart on another device

## 12.5 Scheduled jobs (user-visible effects — verify around the dates or via manual trigger)
- [ ] **Staff year rollover** (Sep 30): the new staff year becomes current automatically; year labels shift ("(current)" / "(from Oct 1)"); the pre-provisioned next year appears for admins
- [ ] **Receipt file purge** (Sep 30/Oct 1): prior-year receipt files removed; receipt cards show the deleted-file state (see 3.6a); the All-tab prior-year warning copy matches
- [ ] **Weekly directory sync** (Mondays): new directory staff + Google profile photos appear without a manual sync
- [ ] **Stale request reminders** (daily): email + push + in-app feed entry to whoever a request waits on

## 12.6 Environment
- [ ] Test builds show the warning-coloured **"Test Environment"** chip; tapping explains the test database
- [ ] iOS release build launches without crashing (worklets/Hermes — 1.6.1 regression watch; needs a release/TestFlight build)

---

## Regression watch (previously fixed — re-verify each release)
- Audit pagination crash when filtered/searched (convex-helpers `paginator`)
- Tag "save all" + metadata-field save audit spam (only changed rows logged)
- Auto-approved steps missing from Reviewed (1.6.12)
- Comment notifications not opening the thread (1.6.3)
- First Google sign-in bouncing back to login (1.6.3)
- Spinner picker ignoring touches (1.6.3)
- Create-event cancel freeze from stacked modals (1.6.7)
- Members-tab custom-role / unresolvable-Year filter vanishing (1.6.13)
- iOS release startup crash (1.6.1)
- Request push deep-link allow-list drift (`shared/deepLinks.ts` test covers it)
