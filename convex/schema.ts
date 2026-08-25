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
    .index("by_requester", ["requesterEmail"]),

  notifications: defineTable({
    userEmail: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
    requestId: v.optional(v.id("requests")),
    read: v.boolean(),
  })
    .index("by_user", ["userEmail"])
    .index("by_user_and_read", ["userEmail", "read"])
    .index("by_user_and_request_and_read", ["userEmail", "requestId", "read"]),

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
    email: v.optional(v.string()),
    sourceImportId: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_email", ["email"])
    .index("by_source_import_id", ["sourceImportId"])
    .index("by_name", ["name"]),

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

  attendanceMetricsDirty: defineTable({
    subgroup: v.string(),
    since: v.number(),
  }).index("by_subgroup", ["subgroup"]),
});
