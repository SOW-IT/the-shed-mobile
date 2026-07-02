import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { metricsDataValidator } from "./metricsData";

export const approvalStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DECLINED")
);

export default defineSchema({
  ...authTables,

  // Convex Auth's users table, extended with profile fields users may edit
  // themselves. Name/email stay synced from Google; role/department live in
  // staffProfiles and are admin-only.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // App-specific, self-editable:
    localChurch: v.optional(v.string()),
    avatarId: v.optional(v.id("_storage")), // custom photo, preferred over Google's
  }).index("email", ["email"]),

  // Per-year roles + department assignment, keyed by email so admins can
  // provision people before their first Google sign-in. A person can hold
  // multiple roles (e.g. Head of Division AND Head of Department); Heads of
  // Division belong to a division, optionally alongside a department.
  staffProfiles: defineTable({
    email: v.string(), // always lowercase
    year: v.number(),
    // The per-role scope links: one entry per role a person holds, tied to its
    // specific department/division/campus. Lets someone be e.g. Head of two
    // departments, Staff of a third, and Head of two divisions at once. Read
    // via assignmentsOf(); the sole source of a profile's roles + scopes.
    // Heads are mirrored here from the authoritative departments/divisions
    // headEmail — those docs remain the source of truth and uniqueness enforcer.
    assignments: v.optional(
      v.array(
        v.object({
          role: v.string(),
          department: v.optional(v.string()),
          division: v.optional(v.string()),
          university: v.optional(v.string()),
        })
      )
    ),
    name: v.optional(v.string()), // synced from Google on sign-in
    // Bound on first sign-in; the durable anchor that survives Google
    // Workspace email renames (see userLink.ts).
    userId: v.optional(v.id("users")),
    // The durable person key shared by all of one person's years, so the
    // same person is recognised even when their email changes (userLink.ts).
    // For people imported from the old web app it's their id in its
    // Firestore; for people who joined later it's their users row id,
    // filled in at provisioning or first sign-in.
    importId: v.optional(v.string()),
  })
    .index("by_email_and_year", ["email", "year"])
    .index("by_year", ["year"])
    .index("by_userId", ["userId"])
    .index("by_importId", ["importId"]),

  // Divisions group departments; both are data-driven and per-year. The
  // head lives on the division (like departments.headEmail) so one person
  // can head several divisions in the same year.
  divisions: defineTable({
    year: v.number(),
    name: v.string(),
    headEmail: v.optional(v.string()), // the Head of Division; lowercase
  }).index("by_year_and_name", ["year", "name"]),

  departments: defineTable({
    year: v.number(),
    name: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()), // the HOD; lowercase
    colour: v.optional(v.string()), // hex, used for department badges
  }).index("by_year_and_name", ["year", "name"]),

  // Universities with a SOW campus presence; Student Leaders belong to one
  // of these instead of a department. Data-driven and per-year.
  universities: defineTable({
    year: v.number(),
    name: v.string(),
  }).index("by_year_and_name", ["year", "name"]),

  // Data-driven, per-year catalog of assignable role names — the roles an
  // admin may pick when assigning a staff member come from that year's list,
  // so older years keep their legacy role names (e.g. "Campus Chaplain").
  roles: defineTable({
    year: v.number(),
    name: v.string(),
  }).index("by_year_and_name", ["year", "name"]),

  // Expo push tokens, per device, keyed by the owner's email so flow events
  // can notify whoever needs to act next.
  pushTokens: defineTable({
    email: v.string(),
    token: v.string(),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  // Google Workspace directory members, replaced on each sync. Lets admins
  // assign people from a picker instead of typing emails. For staff who appear
  // on the org chart we also cache their Google profile thumbnail so faces show
  // up before they ever sign in (see directorySync.run).
  directoryUsers: defineTable({
    email: v.string(), // lowercase primary email
    name: v.optional(v.string()),
    // Cached Google Workspace thumbnail, stored in Convex `_storage`. Only kept
    // for people with a staffProfile (org chart / profile pages); `photoEtag`
    // is Google's thumbnailPhotoEtag, used to skip re-fetching unchanged photos.
    photoId: v.optional(v.id("_storage")),
    photoEtag: v.optional(v.string()),
  }).index("by_email", ["email"]),

  // Singleton-ish sync bookkeeping (key: "directory").
  syncState: defineTable({
    key: v.string(),
    at: v.number(),
    detail: v.optional(v.string()),
  }).index("by_key", ["key"]),

  // Per-year organisation settings (e.g. who the Budget Manager is).
  yearSettings: defineTable({
    year: v.number(),
    budgetManagerEmail: v.optional(v.string()),
    // The $ amount at or above which a request also needs the Director's
    // approval. Unset falls back to DIRECTOR_APPROVAL_THRESHOLD (the historical
    // default); Finance can change it per year. See shared/flow.ts.
    directorApprovalThreshold: v.optional(v.number()),
  }).index("by_year", ["year"]),

  // Approver delegations (out-of-office cover): for `year`, the delegate
  // (`toEmail`) may act on every request the delegator (`fromEmail`) could
  // approve, decline or pay. Admin-managed; one row per (year, from, to).
  approverDelegations: defineTable({
    year: v.number(),
    fromEmail: v.string(), // the approver being covered; lowercase
    toEmail: v.string(), // the person acting on their behalf; lowercase
  })
    .index("by_year", ["year"])
    // Hot path: everyone who delegated TO a given person this year.
    .index("by_year_and_to", ["year", "toEmail"])
    // Exact lookup for dedupe-on-add.
    .index("by_year_and_from_and_to", ["year", "fromEmail", "toEmail"]),

  // People marked "not serving" for a year — they had (or could have had) a
  // staff profile but are no longer assigned. Deleting a staffProfile moves the
  // person here; admins move them between this list and the unassigned pool.
  // Per (year, email); managed years only.
  leavers: defineTable({
    year: v.number(),
    email: v.string(), // lowercase
  })
    .index("by_year", ["year"])
    .index("by_year_and_email", ["year", "email"]),

  // Bank accounts a person has used on a receipt, remembered so they don't
  // re-type BSB/account each time. Owned by email; auto-saved on receipt
  // submission and deletable by the owner. Deduped per (email, bsb, account).
  savedBankAccounts: defineTable({
    email: v.string(), // owner, lowercase
    accountName: v.string(),
    bsb: v.string(),
    accountNumber: v.string(),
    lastUsedAt: v.number(), // for most-recent-first ordering in the picker
    preferred: v.optional(v.boolean()), // exactly one per user should be true
  })
    .index("by_email", ["email"])
    // Exact lookup for dedupe on re-use (one row per owner+account).
    .index("by_email_bsb_accountNumber", ["email", "bsb", "accountNumber"]),

  // A clarification thread on a request: free-text comments by any signed-in
  // staff member, newest read tracked per user for unread badges. Deleted with
  // their request on cancellation.
  requestComments: defineTable({
    requestId: v.id("requests"),
    authorEmail: v.string(), // lowercase
    body: v.string(),
  }).index("by_request", ["requestId"]),

  // Emoji reactions on a comment; one row per (comment, user, emoji) so a tap
  // toggles. Deleted with their comment / request.
  commentReactions: defineTable({
    commentId: v.id("requestComments"),
    userEmail: v.string(), // lowercase
    emoji: v.string(),
  })
    .index("by_comment", ["commentId"])
    .index("by_comment_user_emoji", ["commentId", "userEmail", "emoji"]),

  // Per-user "last read the comments of this request at" marker, for the
  // unread-count badge on each card's comment bubble.
  commentReads: defineTable({
    requestId: v.id("requests"),
    userEmail: v.string(), // lowercase
    lastReadAt: v.number(),
  }).index("by_request_and_user", ["requestId", "userEmail"]),

  // Immutable audit trail: who actioned each step of a request, and when
  // (_creationTime). Events are deleted only when their request is cancelled.
  requestEvents: defineTable({
    requestId: v.id("requests"),
    action: v.string(), // submitted | auto-approved | approved | declined | receipt-submitted | paid
    step: v.optional(v.string()), // hod | budgetManager | director | financeHead
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_request", ["requestId"])
    // Drives the "Reviewed" list: an approver's own approve/decline events,
    // newest first (the implicit _creationTime tiebreaker).
    .index("by_actor", ["actorEmail"]),

  requests: defineTable({
    requesterEmail: v.string(),
    department: v.string(),
    description: v.string(),
    amount: v.number(),

    approvedByHOD: approvalStatus,
    approvedByBudgetManager: approvalStatus,
    // Present only when amount >= DIRECTOR_APPROVAL_THRESHOLD.
    approvedByDirector: v.optional(approvalStatus),
    approvedByFinanceHead: approvalStatus,

    declineReason: v.optional(v.string()),
    approvedTime: v.optional(v.number()),
    declinedTime: v.optional(v.number()),
    // When the last stale-request reminder went out (cooldown marker).
    lastReminderAt: v.optional(v.number()),
    // How many automated stale-request reminders have been sent (1=1d, 2=3d, 3+=weekly).
    reminderCount: v.optional(v.number()),

    receipt: v.optional(
      v.object({
        totalAmount: v.number(),
        recipients: v.array(
          v.object({
            accountName: v.string(),
            bsb: v.string(),
            accountNumber: v.string(),
            amount: v.number(),
            // Receipt/invoice files in Convex storage, per recipient.
            attachments: v.optional(
              v.array(
                v.object({
                  storageId: v.id("_storage"),
                  name: v.string(),
                  // Set by the yearly purge cron once the stored file has been
                  // deleted: the record (and name) stays so history still shows
                  // a file was attached, but its download link no longer works.
                  deleted: v.optional(v.boolean()),
                })
              )
            ),
          })
        ),
      })
    ),
    paid: v.optional(v.boolean()),
    paidAmount: v.optional(v.number()),
    payComment: v.optional(v.string()),
    paidTime: v.optional(v.number()),
  })
    .index("by_requester", ["requesterEmail"]),

  // In-app notification feed: a row per recipient per flow event, mirroring the
  // push/email a person gets so they have an in-app history with an unread
  // badge. Written by requests.ts `notify`; `url` is the in-app route to open.
  notifications: defineTable({
    userEmail: v.string(), // recipient, lowercase
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    // The request this notification is about, when any — so it can be auto-read
    // once that request (or its comment thread) is opened.
    requestId: v.optional(v.id("requests")),
    read: v.boolean(),
  })
    // Newest-first feed for one user.
    .index("by_user", ["userEmail"])
    // Unread lookup for the badge and mark-all-read.
    .index("by_user_and_read", ["userEmail", "read"])
    // The caller's unread notifications for one request, for contextual
    // mark-as-read (the `read` suffix lets us query only the unread rows).
    .index("by_user_and_request_and_read", ["userEmail", "requestId", "read"]),

  // Manual nudges sent by people waiting on a request (requester or anyone in
  // the approval chain). Rate-limited: one nudge per user per request per day.
  requestNudges: defineTable({
    requestId: v.id("requests"),
    nudgerEmail: v.string(), // who sent the nudge, lowercase
    sentAt: v.number(), // ms timestamp
  })
    .index("by_request", ["requestId"])
    .index("by_nudger_and_request", ["nudgerEmail", "requestId"]),

  // ───────────────────────────── Roll-call ─────────────────────────────
  // A lightweight attendance feature ported from time-to-rollcall. SOW is the
  // implicit org; its sub-groups are the campuses (the per-year `universities`
  // rows) plus org-wide "SOW". Every sub-group shares ONE member pool —
  // all of the year's `staffProfiles` — so an event's sub-groups are just the
  // campus label(s) it's run under, never a different roster.

  // An event is tagged with one or more sub-groups (university names, or the
  // literal "SOW"). Two+ sub-groups ⇒ a collaborative event that appears under
  // each. Dates are epoch-ms. The staff year is NOT stored — it's derived from
  // dateStart via `eventStaffYear` (shared/flow.ts); year-scoped reads use the
  // `by_dateStart` range index (a staff year is a contiguous start-date window).
  events: defineTable({
    name: v.string(),
    dateStart: v.number(),
    dateEnd: v.number(),
    sourceImportId: v.optional(v.string()),
    // University names (e.g. "University of Sydney") and/or "SOW".
    subgroups: v.array(v.string()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
  })
    .index("by_dateStart", ["dateStart"])
    .index("by_sourceImportId", ["sourceImportId"]),

  // Immutable audit trail of attendance-area actions: who did what, when
  // (_creationTime). One row per write — event/member/tag/metadata changes and
  // every roll-call sign-in/edit/sign-out. Rows are never updated or deleted
  // (they survive their subject's deletion), so `summary` snapshots names. Read
  // by the Attendance → Audit tab; see convex/attendanceAudit.ts.
  attendanceAuditLog: defineTable({
    actorEmail: v.string(), // who performed it, lowercase
    // Coarse subject kind, drives the UI icon and the entity-type filter.
    entityType: v.union(
      v.literal("event"),
      v.literal("member"),
      v.literal("tag"),
      v.literal("metadata"),
      v.literal("attendance")
    ),
    // Machine key, e.g. "event.create", "member.delete", "attendance.signIn".
    action: v.string(),
    summary: v.string(), // human-readable, with name snapshots
    eventId: v.optional(v.id("events")), // for "filter by event"
    memberId: v.optional(v.id("attendanceMembers")),
    subjectEmail: v.optional(v.string()), // person signed in/out (staff, no member row)
    detail: v.optional(v.string()), // extra context (e.g. before → after)
  })
    .index("by_event", ["eventId"])
    .index("by_actor", ["actorEmail"]),

  // Event category tags (e.g. "Weekly Meeting"), per staff year.
  attendanceTags: defineTable({
    year: v.number(),
    name: v.string(),
    colour: v.optional(v.string()),
    // Undefined/empty means global. Otherwise this tag only applies to these sub-groups.
    subgroups: v.optional(v.array(v.string())),
  })
    .index("by_year", ["year"])
    .index("by_year_and_name", ["year", "name"]),

  // Dynamic member fields (Year, Gender, Campus, Role, …). Global, NOT per year:
  // one row per (key, subgroup), shared across all years, since member metadata
  // (`attendanceMembers.metadata`) is itself year-less and references these ids.
  // The student "Year" level is derived for a viewing calendar year at display
  // time — the field definition carries no year. `year` is a deprecated column
  // kept optional only until `admin:consolidateAttendanceMetadata` has merged
  // the old per-year rows in every environment; the narrow follow-up drops it.
  // Metadata fields are global (not year-scoped) — the same set applies to every
  // staff year, so there is no `year` column.
  attendanceMetadata: defineTable({
    key: v.string(),
    type: v.union(v.literal("select"), v.literal("input")),
    order: v.number(),
    values: v.optional(v.record(v.string(), v.string())),
    // Undefined means global. Otherwise this field is only relevant for this sub-group.
    subgroup: v.optional(v.string()),
    /** When true, select values seeded from org data cannot be removed. */
    lockedValues: v.optional(v.array(v.string())),
  }),

  // Attendance pool members. A member links to a staff profile purely by its
  // `email` matching a `staffProfiles.email` (both SOW-domain spellings); rows
  // whose email matches no profile are attendance-only people. Members are
  // year-less — the same row (and memberId) is reused across all staff years.
  attendanceMembers: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    sourceImportId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_email", ["email"])
    .index("by_source_import_id", ["sourceImportId"])
    .index("by_name", ["name"]),

  // One row per (event, person). Staff use `email`; extra members use
  // `memberId`. Exactly one identifier should be set.
  attendance: defineTable({
    eventId: v.id("events"),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("attendanceMembers")),
    signInTime: v.number(),
    notes: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_and_email", ["eventId", "email"])
    .index("by_event_and_member", ["eventId", "memberId"])
    .index("by_email", ["email"])
    .index("by_member", ["memberId"]),

  // Pre-computed Attendance → Insights dashboard aggregates, refreshed weekly by
  // the `attendance metrics recompute` cron (Thursdays). One row per
  // (sub-group, time range) so the dashboard reads a single bounded document
  // instead of scanning attendance history on the client. `subgroup` is stored
  // canonicalised (legacy "ALL" folded to "SOW"); `rangeWeeks` is one of the
  // precomputed presets `RANGE_WEEKS` (1/2/4/8/12) — the whole-staff-year range
  // (0, STAFF_YEAR_RANGE) is supported by the logic but not currently
  // precomputed. The `data` shape mirrors shared/attendanceMetrics.ts
  // `SubgroupMetricsData` (see convex/metricsData.ts). Also refreshed within
  // minutes of roll-call changes by the `attendance metrics dirty recompute` cron.
  attendanceMetricsSnapshots: defineTable({
    subgroup: v.string(),
    rangeWeeks: v.number(),
    // Whether multi-sub-group (collaborative) events are included — both
    // variants are precomputed so the dashboard's include/exclude toggle reads
    // a snapshot rather than recomputing on the client.
    includeCollaborative: v.boolean(),
    staffYear: v.number(),
    computedAt: v.number(),
    data: metricsDataValidator,
  }).index("by_subgroup_and_range", [
    "subgroup",
    "rangeWeeks",
    "includeCollaborative",
  ]),

  // Sub-groups whose metrics snapshot is stale after a roll-call / event change,
  // drained by the short-interval `recomputeDirty` cron (see attendanceMetrics.ts).
  // One row per dirty sub-group; writing it is cheap and de-duped.
  attendanceMetricsDirty: defineTable({
    subgroup: v.string(), // canonical
    since: v.number(), // first-dirtied wall-clock time
  }).index("by_subgroup", ["subgroup"]),
});
