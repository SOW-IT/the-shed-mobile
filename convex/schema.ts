import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { announcementStatusValidator, audienceValidator } from "./announcementData";
import { metricsDataValidator, staffTrendsValidator } from "./metricsData";
import {
  personCategoryValidator,
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
    churchId: v.optional(v.id("churches")),
    avatarId: v.optional(v.id("_storage")),
    reminderEmails: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("by_churchId", ["churchId"]),

  churches: defineTable({
    name: v.string(),
    nameKey: v.string(),
    address: v.optional(v.string()),
    services: v.optional(v.array(v.object({ day: v.number(), time: v.string() }))),
    website: v.optional(v.string()),
    instagram: v.optional(v.string()),
    addedBy: v.string(),
    updatedBy: v.optional(v.string()),
    location: v.optional(v.object({ lat: v.number(), lng: v.number() })),
    locatedAt: v.optional(v.number()),
  }).index("by_nameKey", ["nameKey"]),

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
    memberId: v.optional(v.id("attendanceMembers")),
  })
    .index("by_email_and_year", ["email", "year"])
    .index("by_year", ["year"])
    .index("by_userId", ["userId"])
    .index("by_importId", ["importId"])
    .index("by_memberId_and_year", ["memberId", "year"]),

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
    standsFor: v.optional(v.string()),
  }).index("by_year_and_name", ["year", "name"]),

  appInstalls: defineTable({
    email: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
    version: v.string(),
    seenAt: v.number(),
  }).index("by_email_and_platform", ["email", "platform"]),

  appUpdatePolicy: defineTable({
    platform: v.union(v.literal("ios"), v.literal("android")),
    minimum: v.optional(v.string()),
    recommended: v.optional(v.string()),
    message: v.optional(v.string()),
  }).index("by_platform", ["platform"]),

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
    lastSuccessAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  yearSettings: defineTable({
    year: v.number(),
    budgetManagerEmail: v.optional(v.string()),
    directorEmail: v.optional(v.string()),
    directorApprovalThreshold: v.optional(v.number()),
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

  mentorships: defineTable({
    year: v.number(),
    menteeEmail: v.string(),
    mentorEmail: v.optional(v.string()),
    externalMentorId: v.optional(v.id("externalMentors")),
    updatedBy: v.string(),
    updatedAt: v.number(),
    legacyKey: v.optional(v.string()),
  })
    .index("by_year", ["year"])
    .index("by_menteeEmail_and_year", ["menteeEmail", "year"])
    .index("by_mentorEmail_and_year", ["mentorEmail", "year"])
    .index("by_externalMentorId", ["externalMentorId"])
    .index("by_legacyKey", ["legacyKey"]),

  externalMentors: defineTable({
    name: v.string(),
    nameKey: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedBy: v.string(),
    updatedAt: v.number(),
    legacyKey: v.optional(v.string()),
  })
    .index("by_nameKey", ["nameKey"])
    .index("by_email", ["email"])
    .index("by_legacyKey", ["legacyKey"]),

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
    .index("by_announcement_and_read", ["announcementId", "read"])
    .index("by_request", ["requestId"]),

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
    lastReminderAt: v.optional(v.number()),
    reminderCount: v.optional(v.number()),
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
    .index("by_status", ["status"]),

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
    lastReminderAt: v.optional(v.number()),
    reminderCount: v.optional(v.number()),
  })
    .index("by_eventRequest_and_kind", ["eventRequestId", "kind"]),

  eventRequestEvents: defineTable({
    eventRequestId: v.id("eventRequests"),
    form: v.optional(subFormKindValidator),
    action: v.string(),
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  }).index("by_eventRequest", ["eventRequestId"]),

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
    subgroups: v.array(v.string()),
    tagIds: v.optional(v.array(v.id("attendanceTags"))),
    weekly: v.optional(weeklyMarkValidator),
    checkIn: v.optional(
      v.object({ token: v.string(), enabledAt: v.number(), enabledBy: v.string() })
    ),
  })
    .index("by_dateStart", ["dateStart"])
    .index("by_checkIn_token", ["checkIn.token"]),

  eventAttendanceCounts: defineTable({
    eventId: v.id("events"),
    count: v.number(),
  }).index("by_eventId", ["eventId"]),

  checkInRequests: defineTable({
    eventId: v.id("events"),
    clientKey: v.string(),
    name: v.string(),
    campus: v.optional(v.string()),
    yearLevel: v.optional(v.string()),
    forSomeoneElse: v.optional(v.boolean()),
    memberId: v.optional(v.id("attendanceMembers")),
    attendanceId: v.optional(v.id("attendance")),
    sameNameCount: v.optional(v.number()),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("dismissed")),
    requestedAt: v.number(),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.string()),
  })
    .index("by_event_and_status", ["eventId", "status"])
    .index("by_event_and_clientKey_and_name", ["eventId", "clientKey", "name"])
    .index("by_clientKey_and_status_and_forSomeoneElse", ["clientKey", "status", "forSomeoneElse"]),

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
    .index("by_actor", ["actorEmail"])
    .index("by_member_and_action", ["memberId", "action"]),

  attendanceTags: defineTable({
    name: v.string(),
    colour: v.optional(v.string()),
    subgroups: v.optional(v.array(v.string())),
    list: v.optional(v.union(v.literal("weeklies"), v.literal("events"))),
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
    email: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    churchId: v.optional(v.id("churches")),
  })
    .index("by_email", ["email"])
    .index("by_name", ["name"])
    .index("by_churchId", ["churchId"])
    .searchIndex("search_name", { searchField: "name" }),

  mergeSuggestionDismissals: defineTable({
    staffEmail: v.string(),
    memberId: v.id("attendanceMembers"),
    dismissedBy: v.string(),
    dismissedAt: v.number(),
  }).index("by_staff_and_member", ["staffEmail", "memberId"]),

  memberPairSuggestions: defineTable({
    memberA: v.id("attendanceMembers"),
    memberB: v.id("attendanceMembers"),
    status: v.union(v.literal("open"), v.literal("dismissed")),
    builtAt: v.number(),
    statsA: v.optional(v.object({ signIns: v.number(), lastSignIn: v.union(v.number(), v.null()) })),
    statsB: v.optional(v.object({ signIns: v.number(), lastSignIn: v.union(v.number(), v.null()) })),
    dismissedBy: v.optional(v.string()),
    dismissedAt: v.optional(v.number()),
  })
    .index("by_members", ["memberA", "memberB"])
    .index("by_status_and_builtAt", ["status", "builtAt"]),

  attendance: defineTable({
    eventId: v.id("events"),
    memberId: v.id("attendanceMembers"),
    signInTime: v.number(),
    addedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })
    .index("by_event", ["eventId"])
    .index("by_event_and_member", ["eventId", "memberId"])
    .index("by_member", ["memberId"]),

  contactRateLimit: defineTable({
    fromEmail: v.string(),
    submittedAt: v.number(),
  })
    .index("by_email_and_time", ["fromEmail", "submittedAt"])
    .index("by_time", ["submittedAt"]),

  appErrors: defineTable({
    fingerprint: v.string(),
    message: v.string(),
    stack: v.optional(v.string()),
    route: v.optional(v.string()),
    platform: v.string(),
    version: v.optional(v.string()),
    lastEmail: v.optional(v.string()),
    count: v.number(),
    firstAt: v.number(),
    lastAt: v.number(),
  })
    .index("by_fingerprint", ["fingerprint"])
    .index("by_lastAt", ["lastAt"]),

  attendanceMetricsSnapshots: defineTable({
    subgroup: v.string(),
    rangeWeeks: v.number(),
    includeCollaborative: v.boolean(),
    staffYear: v.number(),
    computedAt: v.number(),
    data: metricsDataValidator,
  })
    .index("by_subgroup_range_year", [
      "subgroup",
      "rangeWeeks",
      "includeCollaborative",
      "staffYear",
    ]),

  rosterHistorySnapshots: defineTable({
    year: v.number(),
    builtAt: v.number(),
    fullAt: v.optional(v.number()),
    events: v.array(
      v.object({
        eventId: v.id("events"),
        dateStart: v.number(),
        tagIds: v.array(v.string()),
        subgroups: v.array(v.string()),
        weekly: v.optional(v.boolean()),
        count: v.optional(v.number()),
      })
    ),
    members: v.optional(
      v.array(
        v.object({
          memberId: v.id("attendanceMembers"),
          events: v.array(v.number()),
        })
      )
    ),
    memberIds: v.optional(v.array(v.id("attendanceMembers"))),
    memberEvents: v.optional(v.array(v.string())),
  }).index("by_year", ["year"]),

  rollCallOrders: defineTable({
    eventId: v.id("events"),
    inputKey: v.string(),
    builtAt: v.number(),
    memberIds: v.array(v.id("attendanceMembers")),
    scores: v.array(v.number()),
  }).index("by_eventId", ["eventId"]),

  staffTrendsSnapshots: defineTable({
    staffYear: v.number(),
    trends: staffTrendsValidator,
  }),

  campusAttendanceSnapshots: defineTable({
    computedAt: v.number(),
    years: v.array(v.number()),
    campuses: v.array(
      v.object({ campus: v.string(), averages: v.array(v.number()) })
    ),
  }),

  weeklyInsightsSettings: defineTable({
    ...weeklySettingsFields,
    version: v.number(),
  }),

  weeklyTermFacts: defineTable(termFactsFields).index("by_subgroup_and_termKey", [
    "subgroup",
    "termKey",
  ]),

  weeklyInsightViews: defineTable({
    subgroup: v.string(),
    periodKey: v.string(),
    computedAt: v.number(),
    blocks: v.array(weeklyBlockValidator),
  }).index("by_subgroup_and_periodKey", ["subgroup", "periodKey"]),

  weeklyInsightIndex: defineTable({
    subgroup: v.string(),
    computedAt: v.number(),
    periods: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        group: v.optional(v.string()),
        short: v.optional(v.string()),
        kind: v.optional(v.union(v.literal("term"), v.literal("year"))),
        slot: v.optional(v.number()),
      })
    ),
    currentKey: v.union(v.string(), v.null()),
    weeklies: v.array(v.object({ at: v.number(), count: v.number(), joint: v.boolean() })),
    settingsVersion: v.number(),
    viewVersion: v.optional(v.number()),
    auditSeen: v.number(),
    eventsSeen: v.number(),
    nextCompareAt: v.number(),
  }).index("by_subgroup", ["subgroup"]),

  weeklyCategories: defineTable({
    subgroup: v.string(),
    termKey: v.string(),
    people: v.array(personCategoryValidator),
  }).index("by_subgroup", ["subgroup"]),

  homeTabs: defineTable({
    key: v.string(),
    blocks: v.union(v.array(homeBlockValidator), v.null()),
    revision: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_key", ["key"]),
});
