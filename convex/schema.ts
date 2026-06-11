import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    roles: v.optional(v.array(v.string())),
    role: v.optional(v.string()), // legacy single-role field; use rolesOf()
    department: v.optional(v.string()),
    division: v.optional(v.string()), // for Heads of Division
    name: v.optional(v.string()), // synced from Google on sign-in
    // Bound on first sign-in; the durable anchor that survives Google
    // Workspace email renames (see userLink.ts).
    userId: v.optional(v.id("users")),
  })
    .index("by_email_and_year", ["email", "year"])
    .index("by_year", ["year"])
    .index("by_year_and_department", ["year", "department"])
    .index("by_year_and_role", ["year", "role"])
    .index("by_userId", ["userId"]),

  // Divisions group departments; both are data-driven and per-year.
  divisions: defineTable({
    year: v.number(),
    name: v.string(),
  }).index("by_year_and_name", ["year", "name"]),

  departments: defineTable({
    year: v.number(),
    name: v.string(),
    division: v.string(),
    headEmail: v.optional(v.string()), // the HOD; lowercase
    colour: v.optional(v.string()), // hex, used for department badges
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
  // assign people from a picker instead of typing emails.
  directoryUsers: defineTable({
    email: v.string(), // lowercase primary email
    name: v.optional(v.string()),
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
  }).index("by_year", ["year"]),

  // Immutable audit trail: who actioned each step of a request, and when
  // (_creationTime). Events are deleted only when their request is cancelled.
  requestEvents: defineTable({
    requestId: v.id("requests"),
    action: v.string(), // submitted | auto-approved | approved | declined | receipt-submitted | paid
    step: v.optional(v.string()), // hod | budgetManager | director | financeHead
    actorEmail: v.string(),
    detail: v.optional(v.string()),
  }).index("by_request", ["requestId"]),

  requests: defineTable({
    year: v.number(),
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
    .index("by_year", ["year"])
    .index("by_year_and_requester", ["year", "requesterEmail"])
    .index("by_requester", ["requesterEmail"])
    .index("by_year_and_department", ["year", "department"]),
});
