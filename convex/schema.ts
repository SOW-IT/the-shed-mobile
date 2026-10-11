import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { announcementStatusValidator, audienceValidator } from "./announcementData";
import { metricsDataValidator } from "./metricsData";
import {
  termFactsFields,
  weeklyBlockValidator,
  weeklyMarkValidator,
  weeklySettingsFields,
} from "./weeklyInsightsData";
import { homeBlockValidator } from "./homeData";
import { designAnswersValidator, designStatusValidator } from "./designRequestData";
import {
  eventStatusValidator,
  financeDataValidator,
  financeStepValidator,
  riskDataValidator,
  subFormKindValidator,
  subFormStatusValidator,
} from "./eventRequestData";

export const approvalStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DECLINED")
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    localChurch: v.optional(v.string()),
    avatarId: v.optional(v.id("_storage")),
  }).index("email", ["email"]),

  staffProfiles: defineTable({
    email: v.string(),
    year: v.number(),
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
    name: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    importId: v.optional(v.string()),
  })
    .index("by_email_and_year", ["email", "year"])
    .index("by_year", ["year"])
    .index("by_userId", ["userId"])
    .index("by_importId", ["importId"]),

  divisions: defineTable({
    year: v.number(),
    name: v.string(),
    headEmail: v.optional(v.string()),
  }).index("by_year_and_name", ["year", "name"]),

  departments: defineTable({
    year: v.number(),
    name: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()),
    colour: v.optional(v.string()),
  }).index("by_year_and_name", ["year", "name"]),

  universities: defineTable({
    year: v.number(),
    name: v.string(),
  }).index("by_year_and_name", ["year", "name"]),

  roles: defineTable({
    year: v.number(),
    name: v.string(),
  }).index("by_year_and_name", ["year", "name"]),

  // The app version each person last opened on each kind of phone, reported
  // by the app (2.3.1 on). Links to pages an older app can't open stay on the
  // web for people without a new enough app (shared/appLinks.ts).
  appInstalls: defineTable({
    email: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    version: v.string(),
    seenAt: v.number(),
  }).index("by_email_and_platform", ["email", "platform"]),

  // When someone last had The SHED open, on the web or in the app. Written
  // at most every few minutes; see presence.ts.
  lastSeen: defineTable({
    email: v.string(),
    at: v.number(),
  }).index("by_email", ["email"]),

  pushTokens: defineTable({
    email: v.string(),
    token: v.string(),
  })
    .index("by_email", ["email"])
    .index("by_token", ["token"]),

  directoryUsers: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    photoEtag: v.optional(v.string()),
  }).index("by_email", ["email"]),

  syncState: defineTable({
    key: v.string(),
    at: v.number(),
    detail: v.optional(v.string()),
  }).index("by_key", ["key"]),

  yearSettings: defineTable({
    year: v.number(),
    budgetManagerEmail: v.optional(v.string()),
    directorEmail: v.optional(v.string()),
    directorApprovalThreshold: v.optional(v.number()),
    // Event requests with expenses over this also need the Director (see
    // shared/eventRequests.ts); separate from the reimbursement threshold.
    eventDirectorApprovalThreshold: v.optional(v.number()),
    rolloverCopiedFrom: v.optional(v.number()),
    rolloverCompletedAt: v.optional(v.number()),
  }).index("by_year", ["year"]),

  approverDelegations: defineTable({
    year: v.number(),
    fromEmail: v.string(),
    toEmail: v.string(),
  })
    .index("by_year", ["year"])
    .index("by_year_and_to", ["year", "toEmail"])
    .index("by_year_and_from", ["year", "fromEmail"])
    .index("by_year_and_from_and_to", ["year", "fromEmail", "toEmail"]),

  leavers: defineTable({
    year: v.number(),
    email: v.string(),
  })
    .index("by_year", ["year"])
    .index("by_year_and_email", ["year", "email"]),

  savedBankAccounts: defineTable({
    email: v.string(),
    accountName: v.string(),
    bsb: v.string(),
    accountNumber: v.string(),
    lastUsedAt: v.number(),
    preferred: v.optional(v.boolean()),
  })
    .index("by_email", ["email"])
    .index("by_email_bsb_accountNumber", ["email", "bsb", "accountNumber"]),

  requestComments: defineTable({
    requestId: v.id("requests"),
    authorEmail: v.string(),
    body: v.string(),
  }).index("by_request", ["requestId"]),

  commentReactions: defineTable({
    commentId: v.id("requestComments"),
    userEmail: v.string(),
    emoji: v.string(),
  })
    .index("by_comment", ["commentId"])
    .index("by_comment_user_emoji", ["commentId", "userEmail", "emoji"]),

  commentReads: defineTable({
    requestId: v.id("requests"),
    userEmail: v.string(),
    lastReadAt: v.number(),
  }).index("by_request_and_user", ["requestId", "userEmail"]),

  requestEvents: defineTable({
    requestId: v.id("requests"),
    action: v.string(),
    step: v.optional(v.string()),
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_request", ["requestId"])
    .index("by_actor", ["actorEmail"]),

  requests: defineTable({
    requesterEmail: v.string(),
    department: v.string(),
    description: v.string(),
    amount: v.number(),

    approvedByHOD: approvalStatus,
    approvedByBudgetManager: approvalStatus,
    approvedByDirector: v.optional(approvalStatus),
    approvedByFinanceHead: approvalStatus,

    declineReason: v.optional(v.string()),
    approvedTime: v.optional(v.number()),
    declinedTime: v.optional(v.number()),
    lastReminderAt: v.optional(v.number()),
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
            attachments: v.optional(
              v.array(
                v.object({
                  storageId: v.id("_storage"),
                  name: v.string(),
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
    .index("by_requester", ["requesterEmail"])
    .index("by_department", ["department"]),

  notifications: defineTable({
    userEmail: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    requestId: v.optional(v.id("requests")),
    designRequestId: v.optional(v.id("designRequests")),
    eventRequestId: v.optional(v.id("eventRequests")),
    announcementId: v.optional(v.id("announcements")),
    read: v.boolean(),
  })
    .index("by_user", ["userEmail"])
    .index("by_user_and_read", ["userEmail", "read"])
    .index("by_user_and_request_and_read", ["userEmail", "requestId", "read"])
    .index("by_user_and_designRequest_and_read", [
      "userEmail",
      "designRequestId",
      "read",
    ])
    .index("by_user_and_eventRequest_and_read", ["userEmail", "eventRequestId", "read"])
    .index("by_user_and_announcement_and_read", ["userEmail", "announcementId", "read"])
    .index("by_request", ["requestId"]),

  // A message an admin sends to everyone, or to chosen campuses, divisions,
  // departments and roles (shared/announcements.ts) of staff `year`, the one
  // the sender saw (missing on the first few dev rows). It goes out at `sendAt`
  // (straight away, or a time they picked) as a push, a notification in the
  // bell and, if `sendEmail`, an email. `jobId` is the scheduled send, so
  // cancelling a scheduled one stops it. The counts are filled in when it goes.
  announcements: defineTable({
    senderEmail: v.string(),
    year: v.optional(v.number()),
    title: v.string(),
    message: v.string(),
    audience: audienceValidator,
    sendEmail: v.boolean(),
    status: announcementStatusValidator,
    sendAt: v.number(),
    jobId: v.optional(v.id("_scheduled_functions")),
    sentAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.string()),
    recipientCount: v.optional(v.number()),
    pushCount: v.optional(v.number()),
    emailCount: v.optional(v.number()),
  })
    .index("by_sender_and_status", ["senderEmail", "status"])
    .index("by_status_and_sendAt", ["status", "sendAt"]),

  // A design request to the Marketing team. `year` is the staff year it was
  // submitted in and `number` counts up within that year (#1, #2…); both are
  // stored rather than derived because imported requests from the old web app
  // keep their original year, number and submission time. `answers` follow the
  // server-defined form (convex/designRequestForm.ts); `department`, `dueDate`
  // and `title` are copied out of them so lists and emails don't need the form.
  // `legacyKey` ("<year>/<firestore id>") makes the import safe to re-run.
  designRequests: defineTable({
    year: v.number(),
    number: v.number(),
    requesterEmail: v.string(),
    submittedAt: v.number(),
    answers: designAnswersValidator,
    department: v.string(),
    dueDate: v.string(),
    title: v.string(),
    status: designStatusValidator,
    editedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
    declineReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    completedBy: v.optional(v.string()),
    completionNote: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    legacyKey: v.optional(v.string()),
  })
    .index("by_year_and_number", ["year", "number"])
    .index("by_requester_and_year", ["requesterEmail", "year"])
    .index("by_requester_and_status", ["requesterEmail", "status"])
    .index("by_status", ["status"])
    .index("by_legacyKey", ["legacyKey"]),

  designRequestEvents: defineTable({
    designRequestId: v.id("designRequests"),
    action: v.string(),
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  }).index("by_designRequest", ["designRequestId"]),

  designRequestComments: defineTable({
    designRequestId: v.id("designRequests"),
    authorEmail: v.string(),
    body: v.string(),
    // When the comment was written; differs from _creationTime for imports.
    postedAt: v.number(),
    legacyKey: v.optional(v.string()),
  })
    .index("by_designRequest_and_postedAt", ["designRequestId", "postedAt"])
    .index("by_legacyKey", ["legacyKey"]),

  designRequestCommentReads: defineTable({
    designRequestId: v.id("designRequests"),
    userEmail: v.string(),
    lastReadAt: v.number(),
  }).index("by_designRequest_and_user", ["designRequestId", "userEmail"]),

  // An event request: the event itself (answers to the server-defined form in
  // convex/eventRequestForm.ts), filed under its lead `department`. It goes
  // ahead (APPROVED) once its Marketing, Risk and Finance forms
  // (eventSubForms) are each approved or not required. `name`, `startsAt`,
  // `endsAt` and `location` are copied out of the answers for lists and emails;
  // the dates are Sydney wall-clock "2026-01-12T13:00". `legacyKey`
  // ("<year>/<firestore id>") makes the import from the old web app re-runnable.
  eventRequests: defineTable({
    year: v.number(),
    number: v.number(),
    requesterEmail: v.string(),
    department: v.string(),
    submittedAt: v.number(),
    answers: designAnswersValidator,
    name: v.string(),
    startsAt: v.string(),
    endsAt: v.string(),
    location: v.string(),
    status: eventStatusValidator,
    editedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    cancelledBy: v.optional(v.string()),
    cancelNote: v.optional(v.string()),
    legacyKey: v.optional(v.string()),
  })
    .index("by_year_and_number", ["year", "number"])
    .index("by_requester_and_year", ["requesterEmail", "year"])
    .index("by_requester_and_status", ["requesterEmail", "status"])
    .index("by_department_and_year", ["department", "year"])
    .index("by_department_and_status", ["department", "status"])
    .index("by_status", ["status"])
    .index("by_legacyKey", ["legacyKey"]),

  // One of an event's three forms. Marketing keeps `answers` (the form in
  // convex/eventRequestForm.ts), Risk keeps `risk` and Finance keeps
  // `finance`. A pending Finance form waits on `step`: the Director (big
  // budgets only) then the Finance Head.
  eventSubForms: defineTable({
    eventRequestId: v.id("eventRequests"),
    kind: subFormKindValidator,
    status: subFormStatusValidator,
    step: v.optional(financeStepValidator),
    answers: v.optional(designAnswersValidator),
    risk: v.optional(riskDataValidator),
    finance: v.optional(financeDataValidator),
    updatedAt: v.optional(v.number()),
    submittedAt: v.optional(v.number()),
    submittedBy: v.optional(v.string()),
    directorApprovedAt: v.optional(v.number()),
    directorApprovedBy: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
    changesReason: v.optional(v.string()),
  })
    .index("by_eventRequest_and_kind", ["eventRequestId", "kind"])
    .index("by_kind_and_status", ["kind", "status"]),

  eventRequestEvents: defineTable({
    eventRequestId: v.id("eventRequests"),
    form: v.optional(subFormKindValidator),
    action: v.string(),
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  }).index("by_eventRequest", ["eventRequestId"]),

  // Each form has its own thread, between the requester's side and the team
  // that reviews it.
  eventRequestComments: defineTable({
    eventRequestId: v.id("eventRequests"),
    form: subFormKindValidator,
    authorEmail: v.string(),
    body: v.string(),
    postedAt: v.number(),
  }).index("by_eventRequest_and_form_and_postedAt", ["eventRequestId", "form", "postedAt"]),

  eventRequestCommentReads: defineTable({
    eventRequestId: v.id("eventRequests"),
    form: subFormKindValidator,
    userEmail: v.string(),
    lastReadAt: v.number(),
  }).index("by_eventRequest_and_form_and_user", ["eventRequestId", "form", "userEmail"]),

  requestNudges: defineTable({
    requestId: v.id("requests"),
    nudgerEmail: v.string(),
    sentAt: v.number(),
  })
    .index("by_request", ["requestId"])
    .index("by_nudger_and_request", ["nudgerEmail", "requestId"]),

  events: defineTable({
    name: v.string(),
    dateStart: v.number(),
    dateEnd: v.number(),
    sourceImportId: v.optional(v.string()),
    subgroups: v.array(v.string()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
    // A campus weekly's term and week, set when it was created as a Weekly
    // (or by the backfill). Insights trusts these over dates and names.
    weekly: v.optional(weeklyMarkValidator),
  })
    .index("by_dateStart", ["dateStart"])
    .index("by_sourceImportId", ["sourceImportId"]),

  attendanceAuditLog: defineTable({
    actorEmail: v.string(),
    entityType: v.union(
      v.literal("event"),
      v.literal("member"),
      v.literal("tag"),
      v.literal("metadata"),
      v.literal("attendance")
    ),
    action: v.string(),
    summary: v.string(),
    eventId: v.optional(v.id("events")),
    memberId: v.optional(v.id("attendanceMembers")),
    subjectEmail: v.optional(v.string()),
    detail: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_actor", ["actorEmail"]),

  attendanceTags: defineTable({
    name: v.string(),
    colour: v.optional(v.string()),
    subgroups: v.optional(v.array(v.string())),
  }),

  attendanceMetadata: defineTable({
    key: v.string(),
    type: v.union(v.literal("select"), v.literal("input")),
    order: v.number(),
    values: v.optional(v.record(v.string(), v.string())),
    subgroup: v.optional(v.string()),
    lockedValues: v.optional(v.array(v.string())),
  }),

  attendanceMembers: defineTable({
    name: v.string(),
    // A plain member's own email. On a staff person's row it is their staff
    // email, which links the row to their staff profile.
    email: v.optional(v.string()),
    // A staff person's own email, kept apart from the staff one. It becomes
    // `email` when they leave staff and turn into alumni.
    personalEmail: v.optional(v.string()),
    sourceImportId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_email", ["email"])
    .index("by_source_import_id", ["sourceImportId"])
    .index("by_name", ["name"]),

  // An admin said this member isn't this staff person, so Admin → Merges
  // stops suggesting the pair. `staffEmail` is the canonical email key.
  mergeSuggestionDismissals: defineTable({
    staffEmail: v.string(),
    memberId: v.id("attendanceMembers"),
    dismissedBy: v.string(),
    dismissedAt: v.number(),
  }).index("by_staff_and_member", ["staffEmail", "memberId"]),

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

  contactRateLimit: defineTable({
    fromEmail: v.string(),
    submittedAt: v.number(),
  })
    .index("by_email_and_time", ["fromEmail", "submittedAt"])
    .index("by_time", ["submittedAt"]),

  attendanceMetricsSnapshots: defineTable({
    subgroup: v.string(),
    rangeWeeks: v.number(),
    includeCollaborative: v.boolean(),
    staffYear: v.number(),
    computedAt: v.number(),
    data: metricsDataValidator,
  })
    .index("by_subgroup_and_range", [
      "subgroup",
      "rangeWeeks",
      "includeCollaborative",
    ])
    .index("by_subgroup_range_year", [
      "subgroup",
      "rangeWeeks",
      "includeCollaborative",
      "staffYear",
    ]),

  attendanceMetricsRuns: defineTable({
    subgroup: v.string(),
    staffYear: v.number(),
    computedAt: v.number(),
    // Set only by a manual refresh (`recomputeNow`); the nightly cron never
    // touches it, so the manual-refresh cooldown is measured against real
    // manual refreshes rather than the last automatic rebuild.
    lastManualRefreshAt: v.optional(v.number()),
    variants: v.array(v.string()),
  }).index("by_subgroup_and_year", ["subgroup", "staffYear"]),

  // The one number the SOW campus comparison needs from each Snapshot, written
  // alongside it so the comparison doesn't read every campus's full Snapshot.
  attendanceMetricsWeeklyAverages: defineTable({
    subgroup: v.string(),
    rangeWeeks: v.number(),
    includeCollaborative: v.boolean(),
    staffYear: v.number(),
    computedAt: v.number(),
    avgWeekly: v.union(v.number(), v.null()),
  }).index("by_year_range_collab_subgroup", [
    "staffYear",
    "rangeWeeks",
    "includeCollaborative",
    "subgroup",
  ]),

  // One row: the Insights → General campus weekly-attendance chart, rebuilt by
  // the nightly Insights rebuild so opening the tab reads this instead of
  // every weekly meeting's attendance.
  campusAttendanceSnapshots: defineTable({
    computedAt: v.number(),
    years: v.array(v.number()),
    campuses: v.array(
      v.object({ campus: v.string(), averages: v.array(v.number()) })
    ),
  }),

  // Insights → Attendance for each campus, built around its weekly meetings
  // (convex/weeklyInsights.ts). One settings row; the numbers can be changed
  // at any time and take effect at the next build.
  weeklyInsightsSettings: defineTable({
    ...weeklySettingsFields,
    version: v.number(),
  }),

  // Who came to which weekly, one row per campus and term. A finished term's
  // row is only rewritten when one of its weeklies changes.
  weeklyTermFacts: defineTable(termFactsFields).index("by_subgroup_and_termKey", [
    "subgroup",
    "termKey",
  ]),

  // The finished blocks for one campus and one term ("2026-T1") or year
  // ("2026"), so opening Insights reads one row.
  weeklyInsightViews: defineTable({
    subgroup: v.string(),
    periodKey: v.string(),
    computedAt: v.number(),
    blocks: v.array(weeklyBlockValidator),
  }).index("by_subgroup_and_periodKey", ["subgroup", "periodKey"]),

  // One row per campus: the periods it has, where the last build got to in
  // the attendance change log, and its recent weeklies' head counts (which the
  // SOW view's campus comparison reads).
  weeklyInsightIndex: defineTable({
    subgroup: v.string(),
    computedAt: v.number(),
    periods: v.array(v.object({ key: v.string(), label: v.string() })),
    currentKey: v.union(v.string(), v.null()),
    weeklies: v.array(v.object({ at: v.number(), count: v.number(), joint: v.boolean() })),
    settingsVersion: v.number(),
    // Missing on rows written before views had a version: redone next build.
    viewVersion: v.optional(v.number()),
    auditSeen: v.number(),
    eventsSeen: v.number(),
    // When the current year's "vs last year up to today" next changes, so
    // the year view is redone then even if no attendance has changed.
    nextCompareAt: v.number(),
  }).index("by_subgroup", ["subgroup"]),

  // One row per edited Home sub-tab (home, resources, connect, partner). A tab
  // with no row, or null blocks (restored), shows the default content in
  // shared/homeContent.ts. `revision` goes up on every save or restore, so a
  // save from an out-of-date copy is refused.
  homeTabs: defineTable({
    key: v.string(),
    blocks: v.union(v.array(homeBlockValidator), v.null()),
    revision: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_key", ["key"]),
});
