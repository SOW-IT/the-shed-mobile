# Changelog

All notable changes to **The SHED** mobile app. This project follows
[semantic versioning](https://semver.org/); the marketing version lives in
`app.json` and the build number auto-increments per EAS build.

## [Unreleased]

### Added

- **Attendance audit trail.** Every attendance-area change is now recorded with
  who did it and when — events created/updated/deleted, members
  created/updated/deleted, tags and member fields changed, and every roll-call
  sign-in, record edit and sign-out. A new **Audit** tab in the Attendance area
  shows the activity newest-first, searchable and filterable by action type, the
  person who performed it, and the event it relates to. Log entries are immutable
  and snapshot names so they stay readable after the subject is deleted.

## [1.1.0] — 2026-06-25

Attendance (roll-call) arrives — a full attendance tab ported from
time-to-rollcall for tracking who turns up to events, per campus and staff year.

### Added

- **Attendance tab.** Run events under one or more sub-groups (each campus, plus
  org-wide "SOW"), sign people in from a live roster, and manage a shared member
  pool. Collaborative events span several campuses and appear under each; events
  load 20 at a time with a "Load more" button. (#103)
- **Member metadata & tags.** Per-staff-year fields (Year, Gender, Campus, Role)
  describe each member, with an admin editor; Year is captured as the university
  level. Events can be labelled with colour-coded category tags. (#103)
- **CSV export.** Export roll-call attendance for a date range to CSV, using
  native date pickers on device and a web date picker in the browser. (#105)
- **Duplicate-name guard.** Creating a member whose name already exists now shows
  an inline warning and a confirmation step that lists the existing member(s) and
  their metadata, so you can be sure before adding another person with that name.
  (#105)

### Changed

- **Members are one consolidated, year-less list.** A person is a single member
  reused across every staff year (same id), instead of a separate row per year.
  Staff members map to their staff profile for the event's year. (#103)
- **Role/Campus locked values stay synced.** The non-removable options for the
  Role and Campus fields are read live from that staff year's roles/universities
  tables, so removing one there unlocks it here instead of sticking around. (#106)

### Removed

- **Unused template assets.** Dropped Expo starter art and other unreferenced
  images to slim the bundle. (#104)

## [1.0.4] — 2026-06-22

Approvals flexibility (configurable Director cutoff, delegation), an in-app
notification center, admin "Not serving" management, and swipe/receipt fixes.

### Added

- **Configurable Director-approval threshold.** The amount at or above which a
  request also needs the Director's approval is now a per-year Finance setting,
  editable from Admin → Other, instead of a hardcoded $5,000. Only new requests
  are affected; existing requests keep the steps they were created with. (#92)
- **Approver delegation (out-of-office cover).** An admin can delegate one
  person's approver authority to a stand-in for a staff year — the delegate can
  approve, decline and pay everything the approver could. Self-review stays
  blocked. Managed from Admin → Other. (#93)
- **In-app notification center.** A bell in the top bar (with an unread badge)
  opens a Notifications feed of every flow event that pinged you — newest first;
  tap one to mark it read and jump to its target, or "Mark all read". (#94)
- **Admin "Not serving" list.** Admins can park people who are no longer assigned
  for a staff year in a "Not serving" pool in Admin → Users — deleting a profile
  moves them there automatically, and (re)assigning clears the mark. (#96)
- **Receipt scanning (OCR).** Attaching a receipt reads the amount, vendor and
  date off the image and pre-fills the recipient's amount when it's blank — you
  always review before submitting. A hint shows what was read and flags when it's
  over the approved amount. Off until a Gemini key is configured. (#99)

### Changed

- **Make Request button slides with the swipe.** The `+ Make Request` footer now
  slides down off-screen as the swipe leaves the "Mine" tab and back up on return,
  tracking the pager, instead of hard mounting/unmounting. (#89)
- **Notifications auto-mark read.** Opening a request (or its comment thread) now
  clears that request's notifications — you no longer have to tap them in the feed.
  Read notifications stay in the feed as history. (#95)

### Fixed

- **Sub tab bar:** the selected-tab underline no longer flickers to its end-state
  mid-swipe — it stays glued to the finger throughout the drag. (#89)
- **Bottom tab bar:** icons now sit centered on devices with a home indicator,
  instead of low with a gap above them. (#89)
- **Receipt form:** entering recipient/amount/file for one request, cancelling, and
  opening another request's receipt form no longer carries the first request's draft
  over. (#91)

## [1.0.3] — 2026-06-20

UI polish for request cards and the tab bars, plus web fixes. (#87)

### Added

- **Animated request cards.** Completed/finance cards now expand and collapse with
  a smooth height animation; tapping the card header (or the centered chevron)
  toggles it. (#87)
- **Loading placeholders.** While an expanded card loads approver names/times and
  receipt files, soft blurred placeholders show in their place instead of a gap. (#87)

### Changed

- **Bottom tab bar:** icons now give the same press feedback as the rest of the app,
  the bar is slimmer, and the admin (cog) tab matches the other tabs. (#87)
- **Sub tab bar (Mine / To Review):** the selected-tab underline slides — tracking the
  swipe on device, animating on tab change on web. (#87)
- **Full-width chrome:** the top bar and sub tab bar span the full screen width like the
  bottom bar. (#87)
- **Consistent control heights:** the bottom tab bar and the footer buttons (Make Request,
  info) now share a single 50px height, and the tab icons sit centered without a padding
  offset. (#90)

### Fixed

- Switching bottom tabs on the web app no longer triggers a full-page reload. (#87)
- Cancelling the "open in app" prompt on mobile web no longer leaves a blank,
  non-interactive screen. (#87)

## [1.0.2] — 2026-06-19

User-facing features and polish on top of the 1.0.1 release tooling.

### Added

- **Comments notify previous approvers.** A new comment now also pushes everyone
  who has already approved the request, not just whoever it currently waits on. (#83)
- **Unread badge on the "All" tab.** Finance sees a count of unread comments across
  the year's requests, and requests with unread discussion float to the top of the list. (#83)
- **Profile back button** in the top-left, plus a native interactive **swipe-back**
  gesture that reveals the previous screen as you drag. (#83, #84)
- **Tap-to-expand request cards.** Completed/finance cards expand when tapped anywhere,
  with a centered down-arrow hint, instead of a separate "View More" link. (#80)
- **Close (X) button** on list/option dialogs. (#83)
- **Open-in-app redirect:** visiting the web build on a phone bounces into the native
  app (path-preserving), falling back to the App Store / Play Store. (#79)

### Changed

- **Push notifications**
  - You no longer get a push for your own action (e.g. submitting your own request);
    the confirmation email is your acknowledgement. (#80)
  - Concise push titles (e.g. "Approval needed", "Request approved", "New comment");
    the full detail stays in the email. (#80)
  - People are referred to by **name** instead of raw email throughout notifications. (#80)
- **Consistent press feedback:** buttons (including all icon buttons and the top-bar
  home/profile buttons) shrink slightly while pressed and held. (#81)
- **Haptics** are now reserved for the bottom navigation bar only. (#81)
- **Detail screens** (profile, a person, a request) push as cards over the tabs via a
  native stack, giving them the swipe-back gesture. (#84)
- Tighter bottom tab-bar padding, and shorter list/option dialogs so there's always a
  clear area to tap out. (#81, #83)

### Fixed

- Sign-in (Google OAuth): the button stays in its loading state through the whole flow,
  and the redirect allowlist was corrected for the renamed web project. (#77, #78)

## [1.0.1] — 2026-06-19

Release & build tooling — the milestone that makes store submission repeatable.

### Added

- **EAS build + submit workflows** triggered from the Actions tab, with an
  **iOS / Android / both** platform choice on manual dispatch. (#75)
- Separate **manual staging and production** build → submit workflows. (#76)
- `autoIncrement` build numbers so each EAS build gets a fresh build number. (#75)

## [1.0.0] — 2026-06-11

Initial release of **The SHED** — a staff reimbursement app for SOW.

### Added

- Submit reimbursement requests and track them to completion.
- Multi-step approval chain: HOD → Budget Manager → Director → Finance Head, with
  steps auto-approved where the approver is the submitter.
- Receipt / invoice submission and Finance Head payment, including saved bank accounts.
- Per-staff-year **org chart and directory**, with admin management of departments,
  divisions, roles and the Budget Manager.
- **Clarification comment threads** on requests, with emoji reactions and unread tracking.
- **Push and email notifications** across the request lifecycle.
- Profiles with multi-year service history; CSV export of requests for Finance.
- Google sign-in, with light and dark themes.
