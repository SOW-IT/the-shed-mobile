# Changelog

All notable changes to **The SHED** mobile app. This project follows
[semantic versioning](https://semver.org/); the marketing version lives in
`app.json` and the build number auto-increments per EAS build.

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
