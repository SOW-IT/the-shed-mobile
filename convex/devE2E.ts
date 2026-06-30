/**
 * DEV-ONLY end-to-end test harness. NOT for production / merge — this file
 * exists only on the `docs-e2e-test-checklist` worktree to drive the Requests
 * flow through the real UI with Playwright.
 *
 * It can mint Convex Auth JWTs for arbitrary @sow.org.au test emails (so a
 * headless browser comes up logged in) and provision an ISOLATED approval graph
 * (a throwaway division/department + four test profiles), snapshotting and
 * restoring the two org-wide singletons it must touch (the Finance department
 * head and the year's Budget Manager) so no real staff are affected or emailed.
 *
 * Refuses to run unless the deployment is the known dev deployment.
 */
import { SignJWT, importPKCS8 } from "jose";
import { v } from "convex/values";
import { internalMutation, internalQuery, MutationCtx } from "./_generated/server";
import { currentStaffYear, getProfile } from "./model";
import { FINANCE, HEAD_OF_DEPARTMENT, STAFF_ROLE, STUDENT_LEADER } from "../shared/flow";

const DIVISION = "E2E Test Division";
const DEPARTMENT = "E2E Test Dept";
const SNAPSHOT_KEY = "e2e:snapshot";

// Attendance (Section 2): a campus-leader test user (campus leaders are
// attendance managers) + an isolated test campus so events live apart from
// real ones. Tags/metadata/events created in the UI are E2E-prefixed and
// cleaned by attendanceTeardown.
const ATTEND_EMAIL = "e2e-attend@sow.org.au";
// A second campus member (not the event creator) so new-event notifications
// have a recipient to assert against.
const ATTEND_MEMBER_EMAIL = "e2e-attend2@sow.org.au";
const TEST_CAMPUS = "E2E Test Campus";
const E2E_PREFIX = "E2E";

export const EMAILS = {
  requester: "e2e-requester@sow.org.au",
  hod: "e2e-hod@sow.org.au",
  budget: "e2e-budget@sow.org.au",
  finance: "e2e-finance@sow.org.au",
} as const;

/** Hard guard: only ever run against the dev deployment. */
function assertDev() {
  const url = process.env.CONVEX_SITE_URL ?? "";
  if (!url.includes("industrious-robin-425")) {
    throw new Error(`devE2E refuses to run on non-dev deployment: ${url}`);
  }
}

async function upsertUser(ctx: MutationCtx, email: string, name: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
  if (existing) {
    if (!existing.name) await ctx.db.patch("users", existing._id, { name });
    return existing._id;
  }
  return await ctx.db.insert("users", { email, name });
}

/**
 * Mint a Convex Auth access token for a test email. Mirrors
 * @convex-dev/auth's tokens.ts: RS256-signed, sub = `${userId}|${sessionId}`,
 * issuer = CONVEX_SITE_URL, audience = "convex".
 */
export const mintToken = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    assertDev();
    const e = email.trim().toLowerCase();
    const userId = await upsertUser(ctx, e, e.split("@")[0]);
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30d
    });
    // The client clears the JWT on boot unless it also has a refresh token, so
    // issue one. Format mirrors @convex-dev/auth: `${refreshTokenId}|${sessionId}`.
    const refreshTokenId = await ctx.db.insert("authRefreshTokens", {
      sessionId,
      expirationTime: Date.now() + 1000 * 60 * 60 * 24 * 30, // 30d
    });
    const refreshToken = `${refreshTokenId}|${sessionId}`;
    const privateKey = await importPKCS8(process.env.JWT_PRIVATE_KEY!, "RS256");
    const token = await new SignJWT({ sub: `${userId}|${sessionId}` })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setIssuer(process.env.CONVEX_SITE_URL!)
      .setAudience("convex")
      .setExpirationTime(new Date(Date.now() + 1000 * 60 * 60)) // 1h (client refreshes)
      .sign(privateKey);
    return { token, refreshToken, userId, sessionId, email: e };
  },
});

/**
 * Provision the isolated approval graph for the current staff year.
 * Idempotent: re-running first clears any prior test rows.
 */
export const setup = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDev();
    const year = currentStaffYear();

    // Clean any leftovers from a previous run first (keeps it idempotent).
    await teardownInner(ctx, year);

    // Test users (so minted tokens resolve to a users row with an email).
    for (const [k, e] of Object.entries(EMAILS)) await upsertUser(ctx, e, `E2E ${k}`);

    // Isolated structure: a throwaway division + department headed by the HOD.
    await ctx.db.insert("divisions", { year, name: DIVISION });
    await ctx.db.insert("departments", {
      year,
      name: DEPARTMENT,
      division: DIVISION,
      headEmail: EMAILS.hod,
    });

    // Test profiles. Budget Manager + Finance Head must sit in the Finance dept.
    await ctx.db.insert("staffProfiles", {
      email: EMAILS.requester,
      year,
      name: "E2E Requester",
      assignments: [{ role: STAFF_ROLE, department: DEPARTMENT }],
    });
    await ctx.db.insert("staffProfiles", {
      email: EMAILS.hod,
      year,
      name: "E2E HOD",
      assignments: [{ role: HEAD_OF_DEPARTMENT, department: DEPARTMENT }],
    });
    await ctx.db.insert("staffProfiles", {
      email: EMAILS.budget,
      year,
      name: "E2E Budget Manager",
      assignments: [{ role: STAFF_ROLE, department: FINANCE }],
    });
    await ctx.db.insert("staffProfiles", {
      email: EMAILS.finance,
      year,
      name: "E2E Finance Head",
      assignments: [{ role: HEAD_OF_DEPARTMENT, department: FINANCE }],
    });

    // Snapshot + swap the two org-wide singletons so the chain routes to our
    // test approvers and no real staff are involved/emailed.
    const finance = await ctx.db
      .query("departments")
      .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", FINANCE))
      .unique();
    const settings = await ctx.db
      .query("yearSettings")
      .withIndex("by_year", (q) => q.eq("year", year))
      .unique();

    const snapshot = {
      year,
      financeDeptId: finance?._id ?? null,
      financeDeptCreated: false,
      originalFinanceHead: finance?.headEmail ?? null,
      yearSettingsId: settings?._id ?? null,
      yearSettingsCreated: false,
      originalBudgetManager: settings?.budgetManagerEmail ?? null,
    };

    let financeId = finance?._id;
    if (!financeId) {
      financeId = await ctx.db.insert("departments", {
        year,
        name: FINANCE,
        division: DIVISION,
        headEmail: EMAILS.finance,
      });
      snapshot.financeDeptId = financeId;
      snapshot.financeDeptCreated = true;
    } else {
      await ctx.db.patch("departments", financeId, { headEmail: EMAILS.finance });
    }

    if (settings) {
      await ctx.db.patch("yearSettings", settings._id, {
        budgetManagerEmail: EMAILS.budget,
      });
    } else {
      const id = await ctx.db.insert("yearSettings", {
        year,
        budgetManagerEmail: EMAILS.budget,
      });
      snapshot.yearSettingsId = id;
      snapshot.yearSettingsCreated = true;
    }

    // Persist the snapshot in syncState (detail is a free-text string) so
    // teardown can restore even if the orchestrating script dies.
    const existingSnap = await ctx.db
      .query("syncState")
      .withIndex("by_key", (q) => q.eq("key", SNAPSHOT_KEY))
      .unique();
    if (existingSnap) {
      await ctx.db.patch("syncState", existingSnap._id, {
        at: Date.now(),
        detail: JSON.stringify(snapshot),
      });
    } else {
      await ctx.db.insert("syncState", {
        key: SNAPSHOT_KEY,
        at: Date.now(),
        detail: JSON.stringify(snapshot),
      });
    }

    return { year, emails: EMAILS, department: DEPARTMENT, division: DIVISION };
  },
});

/** Read the current state of all test-requester requests, for assertions. */
export const requestState = internalQuery({
  args: {},
  handler: async (ctx) => {
    // #172 dropped requests.year — query by requester only.
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", EMAILS.requester))
      .collect();
    return requests.map((r) => ({
      id: r._id,
      amount: r.amount,
      description: r.description,
      department: r.department,
      approvedByHOD: r.approvedByHOD,
      approvedByBudgetManager: r.approvedByBudgetManager,
      approvedByDirector: r.approvedByDirector,
      approvedByFinanceHead: r.approvedByFinanceHead,
      hasReceipt: !!r.receipt,
      paid: !!r.paid,
      paidAmount: r.paidAmount,
      declineReason: r.declineReason,
    }));
  },
});

async function deleteWhere<T>(
  ctx: MutationCtx,
  table: any,
  rows: { _id: any }[]
) {
  for (const row of rows) await ctx.db.delete(table, row._id);
}

async function teardownInner(ctx: MutationCtx, year: number) {
  const testEmails = new Set<string>(Object.values(EMAILS));

  // Restore singletons from the snapshot, if present.
  const snap = await ctx.db
    .query("syncState")
    .withIndex("by_key", (q) => q.eq("key", SNAPSHOT_KEY))
    .unique();
  if (snap?.detail) {
    const s = JSON.parse(snap.detail);
    if (s.financeDeptId) {
      if (s.financeDeptCreated) {
        await ctx.db.delete("departments", s.financeDeptId);
      } else {
        await ctx.db.patch("departments", s.financeDeptId, {
          headEmail: s.originalFinanceHead ?? undefined,
        });
      }
    }
    if (s.yearSettingsId) {
      if (s.yearSettingsCreated) {
        await ctx.db.delete("yearSettings", s.yearSettingsId);
      } else {
        await ctx.db.patch("yearSettings", s.yearSettingsId, {
          budgetManagerEmail: s.originalBudgetManager ?? undefined,
        });
      }
    }
    await ctx.db.delete("syncState", snap._id);
  }

  // Test requests + everything that hangs off them.
  const requests = await ctx.db
    .query("requests")
    .withIndex("by_requester", (q) => q.eq("requesterEmail", EMAILS.requester))
    .collect();
  for (const r of requests) {
    const comments = await ctx.db
      .query("requestComments")
      .withIndex("by_request", (q) => q.eq("requestId", r._id))
      .collect();
    for (const c of comments) {
      const reactions = await ctx.db
        .query("commentReactions")
        .withIndex("by_comment", (q) => q.eq("commentId", c._id))
        .collect();
      await deleteWhere(ctx, "commentReactions", reactions);
      await ctx.db.delete("requestComments", c._id);
    }
    const reads = await ctx.db
      .query("commentReads")
      .withIndex("by_request_and_user", (q) => q.eq("requestId", r._id))
      .collect();
    await deleteWhere(ctx, "commentReads", reads);
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", r._id))
      .collect();
    await deleteWhere(ctx, "requestEvents", events);
    const nudges = await ctx.db
      .query("requestNudges")
      .withIndex("by_request", (q) => q.eq("requestId", r._id))
      .collect();
    await deleteWhere(ctx, "requestNudges", nudges);
    await ctx.db.delete("requests", r._id);
  }

  // Notifications, push tokens, saved bank accounts for the test emails.
  for (const email of testEmails) {
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect();
    await deleteWhere(ctx, "notifications", notes);
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    await deleteWhere(ctx, "pushTokens", tokens);
    const banks = await ctx.db
      .query("savedBankAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    await deleteWhere(ctx, "savedBankAccounts", banks);

    // Profile for the test year.
    const profile = await getProfile(ctx, email, year);
    if (profile) await ctx.db.delete("staffProfiles", profile._id);

    // User + its auth sessions/refresh tokens.
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (user) {
      const sessions = await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", user._id))
        .collect();
      for (const session of sessions) {
        const refresh = await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
          .collect();
        await deleteWhere(ctx, "authRefreshTokens", refresh);
        await ctx.db.delete("authSessions", session._id);
      }
      await ctx.db.delete("users", user._id);
    }
  }

  // Isolated structure.
  const dept = await ctx.db
    .query("departments")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", DEPARTMENT))
    .unique();
  if (dept) await ctx.db.delete("departments", dept._id);
  const division = await ctx.db
    .query("divisions")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", DIVISION))
    .unique();
  if (division) await ctx.db.delete("divisions", division._id);
}

export const teardown = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDev();
    await teardownInner(ctx, currentStaffYear());
    return { ok: true };
  },
});

// ───────────────────────── Attendance (Section 2) ─────────────────────────

async function deleteUser(ctx: MutationCtx, email: string, year: number) {
  const profile = await getProfile(ctx, email, year);
  if (profile) await ctx.db.delete("staffProfiles", profile._id);
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email))
    .unique();
  if (user) {
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of sessions) {
      const refresh = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      await deleteWhere(ctx, "authRefreshTokens", refresh);
      await ctx.db.delete("authSessions", session._id);
    }
    await ctx.db.delete("users", user._id);
  }
}

async function attendanceTeardownInner(ctx: MutationCtx, year: number) {
  // Test events (E2E-named or under the test campus) + their attendance + audit.
  const events = await ctx.db.query("events").take(4000);
  for (const ev of events) {
    if (!(ev.name.startsWith(E2E_PREFIX) || ev.subgroups.includes(TEST_CAMPUS))) continue;
    const att = await ctx.db
      .query("attendance")
      .withIndex("by_event", (q) => q.eq("eventId", ev._id))
      .collect();
    await deleteWhere(ctx, "attendance", att);
    const audit = await ctx.db
      .query("attendanceAuditLog")
      .withIndex("by_event", (q) => q.eq("eventId", ev._id))
      .collect();
    await deleteWhere(ctx, "attendanceAuditLog", audit);
    await ctx.db.delete("events", ev._id);
  }

  // Test tags (E2E-named, this year).
  const tags = await ctx.db
    .query("attendanceTags")
    .withIndex("by_year", (q) => q.eq("year", year))
    .collect();
  await deleteWhere(ctx, "attendanceTags", tags.filter((t) => t.name.startsWith(E2E_PREFIX)));

  // Test metadata fields (E2E-keyed, global).
  const fields = await ctx.db.query("attendanceMetadata").collect();
  await deleteWhere(ctx, "attendanceMetadata", fields.filter((f) => f.key.startsWith(E2E_PREFIX)));

  // Test guest members (E2E-named).
  const members = await ctx.db.query("attendanceMembers").take(4000);
  await deleteWhere(ctx, "attendanceMembers", members.filter((m) => m.name.startsWith(E2E_PREFIX)));

  // Audit rows performed by the test user (catch-all for actions not tied to a
  // deleted test event).
  const actorAudit = await ctx.db
    .query("attendanceAuditLog")
    .withIndex("by_actor", (q) => q.eq("actorEmail", ATTEND_EMAIL))
    .collect();
  await deleteWhere(ctx, "attendanceAuditLog", actorAudit);

  // Test campus.
  const campus = await ctx.db
    .query("universities")
    .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", TEST_CAMPUS))
    .unique();
  if (campus) await ctx.db.delete("universities", campus._id);

  // Notifications + users for both attendance test accounts.
  for (const email of [ATTEND_EMAIL, ATTEND_MEMBER_EMAIL]) {
    const notes = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userEmail", email))
      .collect();
    await deleteWhere(ctx, "notifications", notes);
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    await deleteWhere(ctx, "pushTokens", tokens);
    await deleteUser(ctx, email, year);
  }
}

export const attendanceSetup = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDev();
    const year = currentStaffYear();
    await attendanceTeardownInner(ctx, year); // idempotent

    await upsertUser(ctx, ATTEND_EMAIL, "E2E Attend Manager");
    const existingCampus = await ctx.db
      .query("universities")
      .withIndex("by_year_and_name", (q) => q.eq("year", year).eq("name", TEST_CAMPUS))
      .unique();
    if (!existingCampus) await ctx.db.insert("universities", { year, name: TEST_CAMPUS });

    // Campus leader of the test campus ⇒ attendance manager (see
    // isAttendanceManagerProfile), without granting broad admin.
    await ctx.db.insert("staffProfiles", {
      email: ATTEND_EMAIL,
      year,
      name: "E2E Attend Manager",
      assignments: [{ role: STUDENT_LEADER, university: TEST_CAMPUS }],
    });
    // A second member of the campus, to receive new-event notifications.
    await upsertUser(ctx, ATTEND_MEMBER_EMAIL, "E2E Attend Member");
    await ctx.db.insert("staffProfiles", {
      email: ATTEND_MEMBER_EMAIL,
      year,
      name: "E2E Attend Member",
      assignments: [{ role: STUDENT_LEADER, university: TEST_CAMPUS }],
    });

    return { year, email: ATTEND_EMAIL, member: ATTEND_MEMBER_EMAIL, campus: TEST_CAMPUS };
  },
});

/** Snapshot of test attendance data, for assertions. */
export const attendanceState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const year = currentStaffYear();
    const events = (await ctx.db.query("events").take(4000)).filter(
      (e) => e.name.startsWith(E2E_PREFIX) || e.subgroups.includes(TEST_CAMPUS)
    );
    const tags = (
      await ctx.db
        .query("attendanceTags")
        .withIndex("by_year", (q) => q.eq("year", year))
        .collect()
    ).filter((t) => t.name.startsWith(E2E_PREFIX));
    const fields = (await ctx.db.query("attendanceMetadata").collect()).filter((f) =>
      f.key.startsWith(E2E_PREFIX)
    );
    return {
      events: events.map((e) => ({
        id: e._id,
        name: e.name,
        subgroups: e.subgroups,
        tagIds: e.tagIds ?? [],
      })),
      tags: tags.map((t) => ({ id: t._id, name: t.name, colour: t.colour, subgroups: t.subgroups })),
      fields: fields.map((f) => ({ key: f.key, type: f.type })),
    };
  },
});

export const attendanceTeardown = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertDev();
    await attendanceTeardownInner(ctx, currentStaffYear());
    return { ok: true };
  },
});

/**
 * The in-app notifications for the test accounts, newest first — mirrors who
 * got a push + (unless self-acknowledged) an email, so E2E can assert that each
 * flow event reached the right person with the right deep-link url.
 */
export const notificationsFor = internalQuery({
  args: {},
  handler: async (ctx) => {
    const emails = [
      ...Object.values(EMAILS),
      ATTEND_EMAIL,
      ATTEND_MEMBER_EMAIL,
    ];
    const rows: {
      to: string;
      title: string;
      body: string;
      url: string | null;
      read: boolean;
      at: number;
    }[] = [];
    for (const email of emails) {
      const notes = await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userEmail", email))
        .collect();
      for (const n of notes) {
        rows.push({
          to: email,
          title: n.title,
          body: n.body,
          url: n.url ?? null,
          read: n.read,
          at: n._creationTime,
        });
      }
    }
    rows.sort((a, b) => b.at - a.at);
    return rows.map(({ at, ...rest }) => rest);
  },
});
