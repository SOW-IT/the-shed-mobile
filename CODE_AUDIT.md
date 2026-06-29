# The Shed Mobile — Repository Health Audit

_Senior architecture & code-quality review. Stack: Expo SDK 56, React Native, TypeScript, Convex._
_Date: 2026-06-29 · Scope: `src/` (app, components, hooks, lib) and `convex/`._

> Note: no prior audit file was committed to the repo or present in git history, so this is a clean
> rewrite rather than a diff against an earlier report.

---

## Executive Summary

**Overall grade: B+**

This is a genuinely well-engineered codebase. Authorization is enforced **server-side** in Convex
with a single, well-factored `authorizeStep` gate; there are **no `any` escapes** in `src/`, **no
leftover `console.log` debug noise**, `strict` TypeScript is on, and the comments are unusually good
— they explain *why* (rollover dates, domain-rename history, OCC invariants) rather than narrating
the obvious. Test coverage in `convex/` is broad (20+ `.test.ts` files).

What keeps it from an A is **size concentration** and **one real subscription-cost problem**:

1. **Read amplification in a live subscription.** `attendance.roster` (`convex/attendance.ts:204-245`)
   re-scans every event in the staff year and runs a per-event attendance query *inside a reactive
   query* — O(events × attendance) on every recompute. This is the single highest-priority fix.
2. **God-files.** `src/components/ui.tsx` (1956 LOC) and `src/app/(tabs)/admin.tsx` (1636 LOC) have
   grown past the point where they can be reviewed or changed safely. `convex/importData.ts` (8011
   LOC) is in a class of its own.
3. **Duplicated identity logic** (`personKey`, roster-row shaping, `metadataSubtitle`) re-implemented
   across the backend and several screens, with subtle case-sensitivity divergence that is currently
   safe only by accident.

Top 3 priorities: **(1)** bound/restructure `attendance.roster`, **(2)** split `ui.tsx` and
`admin.tsx`, **(3)** hoist the duplicated attendance identity/shaping helpers into `shared/`.

---

## 1. Critical Bugs & Edge Cases

### [HIGH] `attendance.roster` is an O(events × attendance) read inside a reactive subscription
`convex/attendance.ts:204-245`

When an event is open, `roster` loads **every** event in the staff year (`historyEvents`, line 204)
and then, in a loop, runs a `by_event` attendance query for **each** of them (line 218) to compute
frequency-ranking scores. Because `roster` is a `query`, Convex re-runs this whole computation on the
client's behalf whenever *any* row in its read set changes — including every sign-in/sign-out on the
open event. As event and attendance history grow, each roster render reads the entire year's
attendance table.

It also `.collect()`s the full `attendanceMembers` and `attendanceMetadata` tables (lines 87, 105)
and does an N+1 `ctx.db.get(p.userId)` per profile (line 163).

**Fix:** precompute ranking outside the hot read. Either (a) maintain a per-person
`attendanceMetadata`-style aggregate updated on sign-in, or (b) move frequency scoring into a
separate `query` the screen calls once (not part of the roster subscription), or (c) cap
`historyEvents` to the last N events via the `by_dateStart` index and short-circuit when an event has
many attendees. At minimum, add a `take()` bound so the cost can't grow unbounded.

### [MEDIUM] Sign-in dedup relies on a non-unique index; concurrent taps can duplicate rows
`convex/attendance.ts:418-467`

`signIn` reads `by_event_and_email` / `by_event_and_member`, returns early if a row exists, else
inserts. Convex has no unique constraints, so two near-simultaneous sign-ins of the same person race:
both read "no existing row", both insert. OCC retries *usually* catch this (the read range is in the
write set), but the existence of the de-dup merge in `listByEvent` (`convex/attendance.ts:398-413`,
"a staff member can have both an `email` sign-in and a `memberId` sign-in") confirms duplicates do
occur in practice.

**Fix:** the read-then-insert is correct for the OCC model; document that the `listByEvent` merge is
the *intended* backstop (not legacy cruft), and add a focused test that two concurrent `signIn`s
collapse to one row. If duplicate `email`+`memberId` rows for one person are not wanted, dedupe them
on write in `ensureForStaff`.

### [MEDIUM] `ensureForStaff` failure is silently swallowed despite a comment promising a toast
`src/app/attendance/event/[eventId].tsx:223-225`

```ts
} catch {
  // ensureForStaff surfaces Convex errors via toast elsewhere if needed
}
```

There is no toast here, and the caught error is discarded. If `ensureForStaff` fails (network, auth
expiry, validation), the edit sheet silently never opens and the user gets no feedback. The comment
actively misleads a future reader into thinking error UX exists.

**Fix:** surface the failure — call the screen's toast/`ErrorBanner` with `errorMessage(e)` (already
exported from `ui.tsx:60`), or remove the misleading comment and let it propagate. The same silent
pattern is worth auditing in `MembersTab.tsx:259-261` (there it at least `console.error`s).

### [LOW] Notification deep-link pushes an unvalidated string with an `as never` cast
`src/hooks/usePushRegistration.ts:35-37`

```ts
if (typeof url === "string" && url.startsWith("/")) {
  router.push(url as never);
}
```

The payload is server-controlled so the risk is low, but `startsWith("/")` admits any path and the
`as never` defeats Expo Router's typed-route checking. A malformed/renamed route silently no-ops or
throws inside the navigator.

**Fix:** validate against a small allow-list of known route prefixes (`/request/`, `/review`,
`/notifications`, `/attendance/`) before pushing, and prefer a typed `Href` over `as never`.

### [LOW] Route param cast without validation
`src/app/attendance/event/[eventId].tsx:75` (`eventId as Id<"events">`)

`useLocalSearchParams` returns `string | string[] | undefined`; the bare cast to `Id<"events">`
assumes a well-formed id. A malformed deep link reaches the query as an invalid id. The screen does
handle `event === null` gracefully (line 174), so impact is contained — flagged for consistency, not
urgency.

---

## 2. Code Complexity & Refactoring Opportunities

### [HIGH] `admin.tsx` is a 1636-line god-component
`src/app/(tabs)/admin.tsx`

One `AdminScreen` default export declares **~20 `useMutation`s** (lines 335-358), a dozen `useQuery`s,
and a stack of inline render functions — `renderUnassignedCard`, `renderLeaverCard`,
`renderProfileCard`, `renderTabContent` (lines 600-819) — that each close over the whole component's
state. Cyclomatic complexity is very high and the file mixes data wiring, grouping logic
(`groupedProfiles`, lines 511-540), and presentation.

**Fix:**
- Extract a `useAdminMutations()` hook returning the 20 mutation handles as a typed object.
- Promote each tab's body to its own component file (`AdminPeopleTab`, `AdminStructureTab`,
  `AdminDelegationsTab`, …) under `src/components/admin/`, mirroring the existing
  `src/components/attendance/*Tab.tsx` pattern already used elsewhere in the repo.
- Move `groupedProfiles`/`otherProfiles` derivation into a `useGroupedProfiles(structure, profiles)`
  hook.

### [HIGH] `ui.tsx` is a 1956-line design-system monolith
`src/components/ui.tsx` — 40+ exports (`Screen`, `Sheet`, `Select`, `MultiSelect`, `Segmented`,
`TabBar`, `Avatar`, `ConfirmDialog`, `OptionSheet`, helpers like `currencyText`, `maskAccount`…).

Every component that imports one symbol pulls the whole file into its module graph, and any change
forces a review of an enormous surface.

**Fix:** split into a `src/components/ui/` directory — `ui/Sheet.tsx`, `ui/Select.tsx`,
`ui/Screen.tsx`, `ui/forms.tsx`, `ui/feedback.tsx` (Toast/ErrorBanner/EmptyState/LoadingState), and
`ui/format.ts` for the pure helpers — re-exported from `ui/index.ts` so call sites don't churn.

### [MEDIUM] `EventAttendanceScreen` mixes fetching, paging, search and rendering
`src/app/attendance/event/[eventId].tsx` (561 LOC)

Five `useQuery`s, three independent paging-limit states reset by two effects (lines 107-149), search
filtering, and three near-identical list-rendering blocks (search / unsigned / signed-in, lines
343-463) live in one function body.

**Fix:** extract a `useEventRoster(evId)` hook owning the queries + derived `unsignedList`/
`searchResults`/`attendanceByKey`/paging, and a single `<RosterSection>` component to collapse the
three duplicated list blocks into one parameterised render.

### [MEDIUM] `roster` and `listByEvent` duplicate row-shaping logic
`convex/attendance.ts:144-195` vs `309-396`

`resolveUniversity`, `metadataSubtitle`, and the staff/extra row construction (roles/campuses dedup,
`user.image` lookup, university resolution) are implemented twice with small differences.

**Fix:** hoist a `buildRosterEntry(profile, shadow, fields, …)` and a shared `metadataSubtitle`
factory used by both handlers, so the two stay in lockstep.

---

## 3. Redundancy & Technical Debt

### [MEDIUM] `personKey` is implemented three times with divergent casing
`convex/attendance.ts:54-58`, `src/components/attendance/MembersTab.tsx`,
`src/app/attendance/event/[eventId].tsx:53-61`

The frontend versions lowercase the email (`staff:${row.email.toLowerCase()}`); the backend `roster`
key is `staff:${p.email}` relying on profile emails already being lowercase. The screen joins backend
roster keys against locally-computed keys (`signedInKeys`, line 128) — correct **only because** every
email in the pipeline happens to already be lowercase. One non-lowercased source upstream and rows
silently fail to match (a person shows as both signed-in and not).

**Fix:** export one `personKey` from `shared/rollcall.ts` and import it everywhere; make it
defensively lowercase so the invariant is enforced, not assumed.

### [LOW] `attendanceMetadata.year` is a known-dead deprecated column
`convex/schema.ts:329-339`

The schema comment says it's kept "only until `admin:consolidateAttendanceMetadata` has merged the
old per-year rows in every environment; the narrow follow-up drops it." Legitimate migration debt —
flagged so it isn't forgotten. Track the narrow-drop as a follow-up ticket and confirm the
consolidation has run in prod before removing.

### [LOW] Full-table `.collect()` scans on shared tables
`convex/attendance.ts:87,105`, `convex/attendanceExport.ts:64,252`, `convex/admin.ts:1485`

`attendanceMembers`, `attendanceMetadata`, and `staffProfiles`/`events` are collected whole. Fine at
current data sizes and acceptable for the export/admin paths, but the ones inside `roster`/
`listByEvent` compound the HIGH issue in §1. Bound them or denormalise as the pool grows.

---

## 4. Best Practices & Architecture

### [STRENGTH] Server-side authorization is solid — no client-bypassable checks found
Every mutation funnels through `requireProfile` / `requireAdmin` (`convex/model.ts:102-153`), and the
approval flow centralises *all* step authorization in one `authorizeStep` gate
(`convex/requests.ts:700-786`) that re-derives approvers from the request's year and validates both
"is this caller the approver (or their delegate)?" and "is the request actually waiting on this
step?" server-side. Queries correctly use `optionalProfile` and return `null`/`[]` instead of
throwing (per the documented "a thrown query crashes the React tree" rule, `model.ts:35`). This is
exactly right.

### [MEDIUM] Deeply relative `_generated` imports are fragile
e.g. `src/app/attendance/event/[eventId].tsx:6-7` →
`../../../../convex/_generated/api`. Reaching into `_generated` is the idiomatic Convex pattern (not a
problem itself), but the four-deep relative paths break on any file move and are easy to get wrong.

**Fix:** add a `@convex/*` (or `@/convex`) path alias in `tsconfig.json` alongside the existing `@/*`,
so imports read `@convex/_generated/api` regardless of file depth.

### [LOW] Expo SDK 56 usage looks current
`usePushRegistration.ts` uses the modern `expo-notifications` handler shape
(`shouldShowBanner`/`shouldShowList`, lines 11-18) and gates correctly on `Device.isDevice` and the
EAS `projectId`. `_layout.tsx` uses the current Expo Router `Stack` + `ConvexAuthProvider` wiring with
`GestureHandlerRootView` at the root. No deprecated APIs spotted. (Per `AGENTS.md`, confirm any
notification-handler field names against the pinned v56 docs before edits.)

### [LOW] Styling is consistent
`StyleSheet.create` + a centralised `@/theme` token system (`spacing`, `radius`, `typography`,
`useAppTheme`) is used uniformly; dynamic colours are layered as inline style arrays on top of static
`StyleSheet` blocks — a deliberate, consistent convention, not ad-hoc inline styling.

---

## 5. Stale Comments & Documentation

### [MEDIUM] Comment promises error UX that doesn't exist
`src/app/attendance/event/[eventId].tsx:224` — "ensureForStaff surfaces Convex errors via toast
elsewhere if needed" contradicts the empty `catch {}` it annotates (see §1). Either wire the toast or
delete the comment.

### [STRENGTH] Comments otherwise explain *why*, not *what*
The codebase is a positive example here: schema comments document the year-rollover and domain-rename
invariants (`schema.ts:53-62`, `auth.ts:23-35`), `model.ts:27-34` explains the JWT-has-no-email
constraint, and `attendance.ts:71-86` explains the staff-year vs calendar-year split. Keep this bar.

---

## Suggested Order of Attack

1. **Bound `attendance.roster`** (§1 HIGH) — correctness-adjacent perf, affects every roll-call open.
2. **Fix the swallowed `ensureForStaff` error + stale comment** (§1/§5 MEDIUM) — small, user-visible.
3. **Hoist `personKey` into `shared/`** (§3 MEDIUM) — removes a latent silent-mismatch bug.
4. **Split `ui.tsx` and `admin.tsx`** (§2 HIGH) — unblocks safe future changes.
5. **Add `@convex/*` path alias** (§4 MEDIUM) — cheap, repo-wide ergonomics win.
