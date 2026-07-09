# Staff-year rollover & cron audit

Audit date: 2026-07-09

Scope: Convex backend correctness and failure modes around the October 1
staff-year rollover (`copyYear` / `rollOverStaffYear`) and every job in
`convex/crons.ts`. Companion to the broader [codebase-audit.md](./codebase-audit.md).

## Remediation in this PR

Highest-impact quick wins landed here:

- `copyYearData` destination lookups use `.first()` instead of `.unique()` for
  divisions, departments, universities, roles, and staff profiles — a stray
  duplicate row can no longer abort the annual rollover cron.
- `financeMembers` judges admin access on the **current** staff year (same as
  `requireFinanceSettingsAccess` / `people`), so the Budget Manager picker for
  next year still works after rollover when the admin's next-year profile is a
  plain staff assignment.

## Follow-up remediation (1.8.9)

Addressed in the follow-up PR after this audit:

- **Idempotent rollover** — `yearSettings.rolloverCopiedFrom` /
  `rolloverCompletedAt` recorded on success; `rollOverStaffYear` no-ops (no
  re-email) when that `(from, to)` already completed; `copyYear` requires
  `force: true` to redo.
- **Full-year copy scans** — `copyYearData` streams source rows with `for await`
  (no `take` caps) for divisions, departments, universities, roles, profiles.
- **Director discovery** — `getApprovers` streams the year instead of
  `take(1000)`.
- **Director threshold copied** alongside the budget manager.
- **Resend failures throw** so scheduled `emails:send` shows failed in the
  Convex dashboard; rollover IT email includes a `Deployment:` line.
- **Purge cron staggered** to Sep 30 **15:00 UTC** (one hour after rollover).

Remaining items below are still runbook / follow-up work.

## Executive summary

Rollover is thoughtfully designed: the cron fires **one minute after** the
Sydney Oct 1 boundary, copies **new-current → new-next** via a non-destructive
merge keyed by name / `importId`, and reimbursement **carry-over** keeps
in-flight requests on their creation-year approvers with a current-year
fallback. As of 1.8.9 the copy is idempotent (completion guard), streams the
full year (no take caps), copies the director threshold, and the receipt purge
runs an hour later. Remaining sharp edges are mostly product/ops: the auth
cliff if next-year profiles aren't pre-provisioned, wall-clock year derivation
inside queries, and live request-list caps.

## Findings

| Severity | Area | Finding | Why it matters | Status / suggested fix |
| -------- | ---- | ------- | -------------- | ---------------------- |
| **High** | Rollover | `copyYearData` used `.unique()` on destination year-scoped rows | A stray duplicate `(year, name)` or `(email, year)` threw and aborted the whole cron; IT email never sent | **Fixed** — switched to `.first()` |
| **High** | Auth at boundary | `requireProfile()` always loads the **current** staff year | At 00:01 Sydney Oct 1, anyone without a profile for the new year gets “No role/department assigned” even if they had one yesterday | Pre-provision next-year profiles before Oct 1; optional grace-period fallback for read-only flows |
| **Medium** | Idempotency | Re-running `rollOverStaffYear` / `copyYear` **overwrites** conflicting destination rows from source | Manual re-run or cron retry clobbers intentional next-year heads / assignments / budget manager | **Fixed (1.8.9)** — `rolloverCompletedAt` guard; `copyYear` needs `force:true` |
| **Medium** | Partial next-year setup | Source wins on conflict for structure + profiles; universities/roles are insert-if-missing only | Admin edits to overlapping keys revert; leftover destination-only roles flip `allowedRolesForYear` to data-driven validation | Pre-rollover checklist; optional “force reset destination year” path |
| **Medium** | Caps | `copyYearData` used `take(200)` divisions/depts, `take(50)` universities/roles, `take(2000)` profiles | Large org → silent omission from the copy | **Fixed (1.8.9)** — stream full indexed year |
| **Medium** | Admin UX | `financeMembers` gated admin on the **viewed** year profile | Next-year Budget Manager picker blanked for current-year admins after rollover | **Fixed** — current-year admin check |
| **Medium** | Queries / time | Multiple queries call `currentStaffYear()` / `staffYearForDate(new Date())` | Non-deterministic queries; subscriptions can churn at the boundary | Pass `year` from the client or derive from stored fields |
| **Medium** | Approvers | `getApprovers` scanned at most **1000** profiles/year for Director | >1000 profiles → Director step may be missing | **Fixed (1.8.9)** — stream until Director found |
| **Medium** | Reminders / live lists | `yearRequests` / `openRequestsAcrossYears` capped (live limit) | Busy year → some open / carried-over requests never reminded or listed | Paginate or index “open + stale”; keep CSV export unbounded |
| **Low** | Email | Rollover emails IT via Resend; missing key / HTTP failure only logs | IT may not know rollover ran; mutation still succeeds | **Partially fixed (1.8.9)** — HTTP failures throw; missing key still no-ops (dev-friendly); body includes Deployment URL |
| **Low** | Not copied | Leavers, delegations, `directorApprovalThreshold` are not copied | Expected gaps; finance/delegation setup needed each year | **Threshold copied (1.8.9)**; leavers/delegations still runbook |
| **Low** | Cron interaction | Purge (14:00 UTC) and rollover (14:01 UTC) same night | Mostly different tables; purge can be a long full-year stream | **Fixed (1.8.9)** — purge at 15:00 UTC |
| **Low** | Events | `eventStaffYear` buckets by **start date only** | Multi-day event spanning Oct 1 uses pre-rollover profiles for the whole event | Document; or split metrics by sign-in date |
| **Low** | Timezone model | `staffYearForDate` uses fixed UTC+10, not IANA `Australia/Sydney` | Correct for Oct 1 midnight (AEST); fragile if boundary rules change | Prefer `Temporal` / `Intl` with `Australia/Sydney` |

## Cron inventory

| Name | Schedule (UTC) | Handler | Risk notes |
| ---- | -------------- | ------- | ---------- |
| stale request reminders | `0 22 * * *` daily | `internal.reminders.remindStale` | Dual-year approver fallback is solid. Bounded by live request window; individual notify failures can abort mid-loop. |
| google directory sync | `0 21 * * 1` Mon | `internal.directorySync.run` | Graceful no-op without SA env vars. Partial photo uploads rolled back on failure. |
| staff year rollover | `1 14 30 9 *` Sep 30 14:01 | `internal.admin.rollOverStaffYear` | One minute after year flip. Idempotent via `rolloverCompletedAt`. Streams full year. Emails IT asynchronously. |
| purge old receipt files | `0 15 30 9 *` Sep 30 15:00 | `internal.cleanup.purgeOldReceiptFiles` | One hour after rollover. Idempotent (`deleted` flag). Streams all requests per staff year (unbounded per year). |
| attendance metrics recompute | `0 3 * * 4` Thu | `internal.attendanceMetrics.recomputeAll` | Fans out one action per sub-group; no aggregated error reporting. |
| attendance metrics dirty recompute | `*/15 * * * *` | `internal.attendanceMetrics.recomputeDirty` | No-op when clean. Leaves dirty flags until each subgroup succeeds. |

### Timing vs year flip

Staff year flips at **Sep 30 14:00:00 UTC** (= Sydney midnight Oct 1 in AEST,
UTC+10 — DST does not start until 2am the first Sunday of October). See
`staffYearForDate` / `staffYearStartMs` in `shared/flow.ts`.

At 14:01 UTC, `rollOverStaffYear` sees the **new** current year and copies
`current → next` (e.g. on 2026-10-01 Sydney: 2027 → 2028). That timing is
correct and well-commented in `crons.ts`.

## Detailed write-ups (rollover focus)

### 1. Duplicate rows could abort the annual cron (fixed)

Read paths (`getProfile`, `getDepartment`) already use `.first()` so admin
screens survive transient duplicates (tested in `admin.test.ts`). The write
path inside `copyYearData` still used `.unique()` for destination matches —
the inverse of the tested read behaviour. A mid-import / mid-re-copy duplicate
would throw, skip the IT summary email, and leave the next year unseeded.

**Fix in this PR:** all destination lookups in `copyYearData` use `.first()`,
with a regression test that plants duplicate divisions / departments / profiles
in the destination year and asserts rollover still completes.

### 2. Re-run overwrites next-year admin work

`copyYearData` is a non-destructive merge: destination-only divisions / roles /
universities are kept, but on name / email / `importId` conflict the **source
wins**. Budget manager is overwritten when the source has one (not cleared when
it doesn't). Universities and roles are insert-if-missing only.

So if admins carefully configure next year and someone re-runs
`npx convex run admin:rollOverStaffYear` (or the cron retries after a partial
failure that somehow re-invokes), heads and assignments on overlapping keys
revert toward the current-year snapshot. There is no `rolloverCompletedAt`
guard.

**Operational mitigation today:** treat the post-Oct-1 copy as a *starting
point* for the year two ahead; don't re-run after editing that destination.
**Code follow-up:** record completion per `(from, to)` and no-op on re-entry,
or offer an explicit “reset destination then copy” flag.

### 3. Auth cliff at midnight Oct 1

`requireProfile` / `requireAdmin` always resolve against `currentStaffYear()`.
The moment the year flips, a user whose next-year profile was never provisioned
loses access even though yesterday's profile still exists. Rollover *does*
copy profiles into the year two ahead — but the **new current** year must
already have been prepared (by last year's rollover or by admins) before the
boundary.

**Runbook:** before Oct 1, confirm the upcoming staff year has divisions,
departments, heads, Budget Manager, Director, and staff profiles. The Admin
year picker already allows editing current + next.

### 4. In-flight requests (solid)

Request year is derived from `_creationTime` via `eventStaffYear`, not the live
year. `openRequestsAcrossYears` unions the current live window with incomplete
previous-year requests. Approval / pay / remind paths resolve approvers for the
**request's year**, falling back to **current-year** officeholders for
carry-overs. Covered by the E2E test
`in-flight previous-year requests survive the rollover end to end`.

Caveat: live lists use a hard per-year `take` (`LIVE_REQUESTS_PER_YEAR_LIMIT`);
extreme volume can drop carry-overs from reminders and the Review tab. CSV
export remains the unbounded path by design.

### 5. What is and isn't copied

| Copied (merge) | Not copied |
| -------------- | ---------- |
| Divisions, departments (+ heads, colours) | `leavers` |
| Universities (insert only), roles (insert only) | `approverDelegations` |
| Staff profiles (assignments, name, userId, importId) | `directorApprovalThreshold` |
| Budget manager email (if set in source) | Attendance tags / events / requests |

### 6. Same-night purge + rollover

`purgeOldReceiptFiles` runs at the flip instant (14:00 UTC); rollover at 14:01.
They touch different concerns (storage attachments vs year-scoped org tables),
so correctness interaction is low. Operationally, a very large purge could make
the night noisy in logs / function budget — staggering to another day is a
nice-to-have, not urgent.

### 7. Wall-clock year inside queries

`currentStaffYear()` is `staffYearForDate(new Date())`. Using it inside
**queries** (directory, profile, attendance metrics snapshot, request year
lists, etc.) makes those queries non-deterministic at the boundary and can
churn reactive subscriptions. Mutations / crons using `Date.now()` are fine.

Follow-up: prefer client-passed `year` or fields stored on documents for query
paths that don't need “live now”.

## What looks solid

- Cron vs flip timing (14:01 after 14:00) matches `staffYearForDate` (+10h) and
  `staffYearStartMs`.
- Carry-over requests: dual-year approver / delegate resolution + E2E test.
- `importId`-first profile matching on copy (email can change year to year).
- Read-path `.first()` resilience and admin gating on current year for
  `people` / finance settings (now also `financeMembers`).
- Reminders: tiered schedule with movement reset; carry-over approver fallback.
- Purge: idempotent, keeps attachment metadata, retention aligned to Oct 1.
- Directory sync: fails gracefully without credentials.
- Attendance metrics: dirty-flag retry; stale `staffYear` snapshots hidden from
  the Insights UI after rollover.

## Suggested runbook (Oct 1)

1. **~1 week before:** confirm next staff year has org structure, heads, Budget
   Manager, Director, and staff profiles; spot-check Admin → year picker.
2. **Night of Sep 30 / Oct 1:** expect the rollover IT email
   (`it@sow.org.au`) around 14:01 UTC, then the receipt-purge log an hour later
   (15:00 UTC). If the email is missing, check Convex logs + Resend env.
3. **Morning of Oct 1:** smoke-test sign-in for a known staffer, submit a
   throwaway request, open Insights (may refresh after dirty/weekly recompute).
4. **Do not** re-run `rollOverStaffYear` after editing the newly seeded year —
   the cron is idempotent and will no-op, but `copyYear` with `force:true` will
   overwrite conflicting keys from the source year.
5. Re-establish **delegations** for the new year (not copied). Director
   threshold is copied from the source year when set.
