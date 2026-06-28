# Codebase Audit

Audit date: 2026-06-29

Scope: Expo SDK 56 React Native app, Convex backend, shared domain logic,
scripts, CI, configuration, tests, and dependency posture. This is a read-only
engineering audit captured as a prioritized remediation report.

## Remediation Update

This PR now includes fixes for the highest-impact quick wins from the audit:

- Receipt bank details are redacted from general request reads and remain
  available only to the requester, Finance, Finance Head, or authorized
  delegates.
- Receipt submission validates recipient, attachment count, attachment name, and
  storage file-size limits.
- Request deletion/cancellation drains related audit events, nudges, comments,
  reactions, and read markers in batches.
- The high-severity Convex `ws` production advisory is resolved by upgrading
  Convex to `^1.42.0`.
- Unused Expo dependencies were removed, Android `RECORD_AUDIO` was removed, a
  `typecheck` script was added, and npm Dependabot coverage was added.
- Attendance tag/metadata writes now require an admin or campus leader instead
  of any provisioned staff profile.
- The riskiest silent query caps/scans were reduced: Finance year request reads
  no longer truncate at 500, event lists paginate from the date index, and
  roll-call roster history is bounded.

Remaining recommendations in this report are mostly medium/large refactors:
splitting large modules, deeper read-model indexing, and redesigning comment
unread counters for high-volume request sets.

## Executive Summary

- Overall code quality: 7.5/10.
- Maintainability: Good in the Convex domain layer, with clear business rules
  and strong backend coverage. Maintainability pressure is concentrated in
  large frontend/backend files and broad read models.
- Technical debt: Moderate. Most debt is scale, privacy, and modularity debt,
  not day-to-day instability.
- Biggest strengths:
  - 490 passing tests across backend and shared domain logic.
  - Strict TypeScript config.
  - Strong server-side authorization for reimbursement approval steps.
  - Clear domain documentation and defensive handling of staff-year rollover.
- Biggest risks identified at audit time:
  - Receipt bank details were exposed too broadly through request documents;
    this PR now redacts them for callers outside the receipt visibility boundary.
  - Production dependency audit reported a high-severity `ws` advisory through
    the previous Convex package; this PR upgrades Convex and clears that high
    advisory.
  - Some live Convex queries scan or collect whole tables and then filter in
    JavaScript; this PR fixes the riskiest silent caps/scans, with larger read
    model refactors left in the roadmap.
  - A raw `tsc --noEmit` check failed at audit time; this PR fixes that issue
    and adds `npm.cmd run typecheck`.

Original audit verification before remediation:

- `npm.cmd run lint` passed.
- `npm.cmd test` passed: 23 files, 490 tests.
- `npx.cmd tsc --noEmit` failed because of the tab button
  `PressableStateCallbackType` issue fixed later in this PR.
- `npm.cmd audit --omit=dev --json` reported 2 high and 12 moderate production
  advisories.

Post-remediation verification:

- `npm.cmd run typecheck` passed.
- `npm.cmd run lint` passed.
- `npm.cmd run test:coverage` passed.
- `npm.cmd audit --omit=dev` no longer reports the high-severity Convex `ws`
  advisory; remaining moderate advisories are Expo transitive dependencies.

## High Priority

### 1. Receipt bank details are visible to any signed-in staff with a request id

- File: `convex/requests.ts`
- Function/Class: `get`
- Severity: High
- Category: Security / privacy
- Related UI: `src/components/RequestCard.tsx`,
  `src/components/ReceiptRecipientList.tsx`,
  `src/app/request/[id].tsx`

Description:

`requests.get` returns the full `requests` document to any provisioned signed-in
staff member. Receipt recipient bank details are stored directly on that
document, and `RequestCard` renders `recipient.bsb` and
`recipient.accountNumber` whenever `request.receipt` exists. Attachment signed
URLs are separately guarded by `receiptAttachments`, but the BSB/account fields
are already exposed before that guard matters.

Why it matters:

Bank details are sensitive financial data. The current API shape makes request
visibility and payment-detail visibility the same permission, even though the
code already treats receipt files as more restricted.

How it could occur:

Any signed-in staff member who receives, guesses, logs, or otherwise obtains a
request id can open `/request/<id>` and receive the full request row. Finance
"All Requests" views also render request cards with receipt details.

Recommended fix:

Move receipt payment details behind the same authorization boundary as
`receiptAttachments`, or return sanitized request DTOs by default. Only include
full receipt recipient details for the requester, Finance staff, the Finance
Head of the request/current year, or authorized delegates.

Estimated effort: M

### 2. Production dependency audit reports vulnerable Convex/ws chain

- File: `package.json`
- Function/Class: dependencies
- Severity: High
- Category: Dependencies / security

Description:

`npm audit --omit=dev` reports `convex@1.41.0` pulling a vulnerable `ws` range
with GHSA-96hv-2xvq-fx4p, a high-severity memory exhaustion DoS advisory.

Why it matters:

Even when runtime exposure is indirect, production dependencies with high
advisories should be patched promptly, especially for networking libraries.

How it could occur:

The installed Convex package depends on `ws` in the affected range
`>=8.0.0 <8.21.0`.

Recommended fix:

Upgrade Convex to the patched wanted/latest line, regenerate the lockfile, and
run lint, tests, typecheck, and a deployment smoke check.

Estimated effort: S

## Medium Priority

### 3. Typecheck currently fails locally

- File: `src/app/(tabs)/_layout.tsx`
- Function/Class: `AnimatedTabBarButton`
- Severity: Medium
- Category: Type safety / CI

Description:

`npx.cmd tsc --noEmit` fails because `children({ pressed: false })` omits the
required `hovered` property from `PressableStateCallbackType`.

Why it matters:

The repository advertises TypeScript strictness and CI typechecking. A failing
raw typecheck means CI can block unrelated PRs, and local checks can give a
false sense of green status if only lint/tests are run.

Recommended fix:

Pass the full callback state expected by React Native, or avoid manually
invoking the `Pressable` render function. Add a `typecheck` script to
`package.json` so local and CI commands are aligned.

Estimated effort: S

### 4. Request list reads silently cap at 500 rows per year

- File: `convex/requests.ts`
- Function/Class: `yearRequests`, `openRequestsAcrossYears`, `toReview`,
  `allRequests`
- Severity: Medium
- Category: Bug / scalability

Description:

`yearRequests` uses `take(500)` and feeds multiple user-facing request lists. A
busy year can silently omit requests beyond the cap.

Why it matters:

If the organization grows or imports historical data, actionable requests can
disappear from "To Review" or "All Requests" while no error is shown.

Recommended fix:

Paginate request lists or introduce indexed read models by lifecycle and
actionability. Avoid shared capped helpers for correctness-sensitive workflows.

Estimated effort: M

### 5. Event list query scans all events and performs per-row count queries

- File: `convex/events.ts`
- Function/Class: `listBySubgroup`, `attendanceCount`
- Severity: Medium
- Category: Performance

Description:

`listBySubgroup` collects all events, filters by subgroup in JavaScript, sorts,
then queries attendance for each event on the returned page.

Why it matters:

This is acceptable for a small dataset but becomes all-table work plus an N+1
pattern as event history grows. Because it is a live Convex query, every extra
read also contributes to subscription invalidation cost.

Recommended fix:

Store indexable subgroup/year fields or add event summary rows that include
attendance count. Paginate from an indexed source instead of collecting all
events first.

Estimated effort: M/L

### 6. Roster query reads large cross-table history for ranking

- File: `convex/attendance.ts`
- Function/Class: `roster`
- Severity: Medium
- Category: Performance

Description:

`roster` loads staff profiles, attendance members, staff-year events, and
attendance rows for historical events to compute attendance-frequency ranking.

Why it matters:

Roster is likely one of the hottest interactive attendance screens. The
current ranking logic can become the slowest live subscription in the app as
events and attendance rows accumulate.

Recommended fix:

Cache attendance frequency per person/subgroup/tag, or compute from a bounded
recent-event window. Keep the live roster read focused on the current event and
member pool.

Estimated effort: L

### 7. Unread comment counts multiply reads across request lists

- File: `convex/comments.ts`
- Function/Class: `unreadTotalForRequests`, `unreadCountsForRequests`,
  `unreadCountFor`
- Severity: Medium
- Category: Performance
- Related UI: `src/components/AllRequestsList.tsx`

Description:

Unread count helpers loop over request ids and collect comments per request.
The Finance "All" list can multiply this into many live reads.

Why it matters:

Comment badges are small UI details, but the underlying live query can become
expensive when a list has many requests.

Recommended fix:

Maintain per-request/user unread state, or query recent comments and
`commentReads` in a bounded batch. Consider returning unread counts with the
request list DTO when feasible.

Estimated effort: M

### 8. Receipt submission lacks server-side resource limits

- File: `convex/requests.ts`
- Function/Class: `submitReceipt`
- Severity: Medium
- Category: Validation / resource limits

Description:

Receipt submission validates positive amounts and presence of at least one
file, but it does not cap recipient count, attachment count, attachment name
length, or verify `_storage` metadata before embedding attachment references in
the request document.

Why it matters:

The receipt is stored as nested arrays on the `requests` document. A malicious
or buggy client can push the document toward Convex size limits or store
unexpected references.

Recommended fix:

Enforce small server-side limits for recipients, attachments per recipient,
name lengths, and total attachment count. Check storage metadata for accepted
files where possible.

Estimated effort: S/M

### 9. Attendance administration mutations are broad

- File: `convex/attendanceMetadata.ts`
- Function/Class: `saveAll`, `ensureDefaults`
- Severity: Medium
- Category: Authorization
- Related files: `convex/attendanceTags.ts`, `convex/attendanceMembers.ts`,
  `convex/events.ts`

Description:

Attendance metadata, tag management, member create/update/delete, and event
create/update/delete generally require only `requireProfile`. The UI exposes
these controls under the Attendance area without a separate capability check.

Why it matters:

If product policy is "any staff can run roll-call" but not "any staff can
administer global metadata/member catalogs", the backend boundary is too broad.

Recommended fix:

Introduce an attendance-admin capability or reuse the existing admin checks for
global settings/catalog mutations. Keep simple sign-in/sign-out available to
ordinary staff if that is intentional.

Estimated effort: M

## Low Priority

### 10. Request audit event cleanup is capped at 200 rows

- File: `convex/requests.ts`
- Function/Class: `cancel`, `deleteDeclined`
- Severity: Low/Medium
- Category: Bug

Description:

Comment cleanup drains in loops, but request audit events are deleted with a
single `take(200)`.

Why it matters:

A request with more than 200 audit events can leave orphaned `requestEvents`
after cancellation/deletion.

Recommended fix:

Extract a shared request cascade cleanup helper and batch-loop all child tables
consistently.

Estimated effort: S

### 11. Android requests RECORD_AUDIO without an apparent audio feature

- File: `app.json`
- Function/Class: Android permissions
- Severity: Low/Medium
- Category: Privacy / store review

Description:

Android declares `android.permission.RECORD_AUDIO`, but no audio feature or
audio package usage was found in the source.

Why it matters:

Unexpected microphone permission can alarm users and complicate store privacy
review.

Recommended fix:

Remove the permission unless a native dependency truly requires it. Confirm in
an Android build after removal.

Estimated effort: S

### 12. Npm dependencies are not covered by Dependabot and some direct deps look unused

- File: `.github/dependabot.yml`
- Function/Class: dependency automation
- Severity: Low
- Category: Dependencies
- Related file: `package.json`

Description:

Dependabot is configured for GitHub Actions only. Several direct dependencies
look unused from source search, including `expo-glass-effect`, `expo-symbols`,
and `expo-image`.

Why it matters:

Unused packages increase install/build surface and can bring advisories through
transitive dependencies. Missing npm automation makes security patching more
manual.

Recommended fix:

Add npm Dependabot. Run `expo install --check` and prune unused packages after
confirming they are not required by native config or planned features.

Estimated effort: S

## Refactoring Opportunities

- Split `src/components/ui.tsx` into primitives, overlays/sheets, selectors,
  loading/empty states, and navigation chrome.
- Split `convex/admin.ts` by staff profiles, org structure, delegations, and
  migrations/seed.
- Split `src/app/(tabs)/admin.tsx` into tab panels and assignment editor
  components.
- Extract shared request child cleanup for events, comments, reactions, reads,
  and nudges.
- Create sanitized request DTO builders for list/detail cards so privacy rules
  are centralized.
- Create indexed or summarized read models for attendance event lists, request
  cards, and roster ranking.

## Technical Debt Roadmap

### Quick Wins (<30 mins)

- Fix the `tsc --noEmit` error in `src/app/(tabs)/_layout.tsx`.
- Add a `typecheck` script to `package.json`.
- Remove Android `RECORD_AUDIO` if not required.
- Add npm Dependabot.

### Small Tasks (1-2 hours)

- Upgrade Convex and verify the `ws` advisory is gone.
- Add receipt server limits.
- Batch-loop request audit event cleanup.
- Prune confirmed unused dependencies.

### Medium Tasks (Half Day)

- Return sanitized request shapes by default and gate full receipt data.
- Add attendance-admin authorization checks for metadata, tags, and member
  catalog management.
- Reduce unread-comment read amplification.

### Large Refactors (1-5 Days)

- Replace attendance event all-table scans with indexed or summary-backed
  pagination.
- Replace roster historical-frequency scans with precomputed or bounded ranking.
- Paginate request lists beyond the current 500-row cap.
- Split `ui.tsx`, `admin.ts`, and the admin tab UI into smaller modules.

### Long-term Architecture Improvements

- Introduce explicit read models for request cards, request details, receipt
  payment details, attendance event summaries, and roster search.
- Keep payment/receipt privacy as an API-shape guarantee rather than a UI
  convention.
- Track production Convex query read/write volume and use measured hot paths to
  prioritize summary tables or denormalized fields.

