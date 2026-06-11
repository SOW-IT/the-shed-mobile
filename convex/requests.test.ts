/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { involvedApproverEmails, nextApproverEmail } from "./requests";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const YEAR = staffYearForDate(new Date());

// Personas (all provisioned by email, like an admin would).
const ADMIN = "admin@sow.org.au"; // Data and IT => admin
const RACHEL = "rachel@sow.org.au"; // Marketing staff
const HENRY = "henry@sow.org.au"; // Marketing HOD
const BELLA = "bella@sow.org.au"; // Finance staff, Budget Manager
const FIONA = "fiona@sow.org.au"; // Finance head
const DAN = "dan@sow.org.au"; // Director

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** Seeds the org chart and personas for the current staff year. */
async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Marketing",
    division: "Engagement",
    headEmail: HENRY,
  });
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Finance",
    division: "Governance",
    headEmail: FIONA,
  });
  const assignments: { email: string; roles: string[]; department: string }[] = [
    { email: RACHEL, roles: ["Staff"], department: "Marketing" },
    { email: HENRY, roles: ["Head of Department"], department: "Marketing" },
    { email: BELLA, roles: ["Staff"], department: "Finance" },
    { email: FIONA, roles: ["Head of Department"], department: "Finance" },
    { email: DAN, roles: ["Director"], department: "Marketing" },
  ];
  for (const a of assignments) {
    await admin.mutation(api.admin.setStaffProfile, { year: YEAR, ...a });
  }
  await admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

describe("submission auto-approval (REQUESTS_FLOW auto-approval table)", () => {
  test("a staff request starts fully pending, with Director only at >= $5000", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "small", amount: 200 });
    await rachel.mutation(api.requests.submit, { description: "big", amount: 5000 });
    const [small, big] = (await rachel.query(api.requests.myRequests, {})).sort(
      (a, b) => a.amount - b.amount
    );
    expect(small.approvedByHOD).toBe("PENDING");
    expect(small.approvedByDirector).toBeUndefined();
    expect(big.approvedByDirector).toBe("PENDING"); // boundary: exactly $5000
  });

  test("an HOD's own request skips the HOD step", async () => {
    const t = await setup();
    const henry = asUser(t, HENRY);
    await henry.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await henry.query(api.requests.myRequests, {});
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
  });

  test("the Budget Manager's own request skips HOD (Finance) and Budget Manager", async () => {
    const t = await setup();
    const bella = asUser(t, BELLA);
    await bella.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await bella.query(api.requests.myRequests, {});
    expect(request.approvedByHOD).toBe("APPROVED"); // Finance has no HOD step
    expect(request.approvedByBudgetManager).toBe("APPROVED");
    expect(request.approvedByFinanceHead).toBe("PENDING");
  });

  test("the Finance Head's own request skips everything except Director", async () => {
    const t = await setup();
    const fiona = asUser(t, FIONA);
    await fiona.mutation(api.requests.submit, { description: "x", amount: 9000 });
    const [request] = await fiona.query(api.requests.myRequests, {});
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("APPROVED");
    expect(request.approvedByFinanceHead).toBe("APPROVED");
    expect(request.approvedByDirector).toBe("PENDING");
  });

  test("the Director's own >= $5000 request skips HOD (own dept) and Director", async () => {
    const t = await setup();
    const dan = asUser(t, DAN);
    await dan.mutation(api.requests.submit, { description: "x", amount: 6000 });
    const [request] = await dan.query(api.requests.myRequests, {});
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByDirector).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
  });
});

describe("approval chain order and authorization", () => {
  test("the full chain: HOD -> Budget Manager -> Finance Head -> receipt -> pay", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await rachel.query(api.requests.myRequests, {});

    // Budget Manager can't jump the queue before the HOD.
    await expect(
      asUser(t, BELLA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/not waiting on that step/);

    await asUser(t, HENRY).mutation(api.requests.approve, {
      requestId: request._id,
      step: "hod",
    });
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "budgetManager",
    });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: request._id,
      step: "financeHead",
    });

    await rachel.mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        { accountName: "R", bsb: "000-000", accountNumber: "1", amount: 95 },
      ],
    });
    const fiona = asUser(t, FIONA);
    const review = await fiona.query(api.requests.toReview, {});
    expect(review.readyToPay.map((r) => r._id)).toEqual([request._id]);
    await fiona.mutation(api.requests.pay, {
      requestId: request._id,
      paidAmount: 95,
    });

    const [done] = await rachel.query(api.requests.myRequests, {});
    expect(done.paid).toBe(true);
  });

  test("random staff can't approve; approvers can't review their own requests", async () => {
    const t = await setup();
    await asUser(t, HENRY).mutation(api.requests.submit, {
      description: "x",
      amount: 100,
    });
    const [request] = await asUser(t, HENRY).query(api.requests.myRequests, {});

    await expect(
      asUser(t, RACHEL).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/not the approver/);
  });

  test("a declined request is closed at every later step", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await rachel.query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id,
      step: "hod",
      reason: "Not in budget",
    });
    await expect(
      asUser(t, BELLA).mutation(api.requests.approve, {
        requestId: request._id,
        step: "budgetManager",
      })
    ).rejects.toThrow(/declined/);
  });

  test("HOD only sees their own department's pending requests in To Review", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "marketing",
      amount: 100,
    });
    await asUser(t, BELLA).mutation(api.requests.submit, {
      description: "finance",
      amount: 100,
    });
    const review = await asUser(t, HENRY).query(api.requests.toReview, {});
    expect(review.hod).toHaveLength(1);
    expect(review.hod[0].department).toBe("Marketing");
    expect(review.budgetManager).toHaveLength(0); // Henry isn't the BM
  });
});

describe("admin and per-year rules", () => {
  test("non-admins can't assign roles/departments (not even their own)", async () => {
    const t = await setup();
    await expect(
      asUser(t, RACHEL).mutation(api.admin.setStaffProfile, {
        email: RACHEL,
        year: YEAR,
        roles: ["Head of Department"],
        department: "Marketing",
      })
    ).rejects.toThrow(/Only admins/);
  });

  test("admins can provision someone who has never signed in, for current and next year", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDivision, { year: YEAR + 1, name: "Operations" });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR + 1,
      name: "Marketing",
      division: "Operations",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "newhire@sow.org.au",
      year: YEAR + 1,
      roles: ["Staff"],
      department: "Marketing",
    });
    const nextYearProfiles = await admin.query(api.admin.listStaffProfiles, {
      year: YEAR + 1,
    });
    expect(nextYearProfiles.map((p) => p.email)).toContain("newhire@sow.org.au");

    // ...but not for years beyond next.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "newhire@sow.org.au",
        year: YEAR + 2,
        roles: ["Staff"],
        department: "Marketing",
      })
    ).rejects.toThrow(/only manage/);
  });

  test("Human Resources division members are admins too", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "pnc@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "People and Culture", // in the Human Resources division
    });
    // The People and Culture member can now assign roles themselves.
    await asUser(t, "pnc@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "someone@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const profiles = await asUser(t, "pnc@sow.org.au").query(
      api.admin.listStaffProfiles,
      { year: YEAR }
    );
    expect(profiles.map((p) => p.email)).toContain("someone@sow.org.au");
  });

  test("the Budget Manager must be from the Finance department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await expect(
      admin.mutation(api.admin.setBudgetManager, { year: YEAR, email: RACHEL })
    ).rejects.toThrow(/Finance/);
    // Moving the BM out of Finance clears the assignment.
    await admin.mutation(api.admin.setStaffProfile, {
      email: BELLA,
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const structure = await admin.query(api.directory.yearStructure, { year: YEAR });
    expect(structure.budgetManagerEmail).toBeNull();
  });

  test("org chart groups director, divisions, heads and members", async () => {
    const t = await setup();
    const chart = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    expect(chart.year).toBe(YEAR);
    expect(chart.director?.email).toBe(DAN);

    const engagement = chart.divisions.find((d) => d.name === "Engagement");
    const marketing = engagement?.departments.find((d) => d.name === "Marketing");
    expect(marketing?.head?.email).toBe(HENRY);
    // Members exclude the head and the Director.
    expect(marketing?.members.map((m) => m.email)).toEqual([RACHEL]);

    const governance = chart.divisions.find((d) => d.name === "Governance");
    const finance = governance?.departments.find((d) => d.name === "Finance");
    expect(finance?.head?.email).toBe(FIONA);
    expect(finance?.members.map((m) => m.email)).toEqual([BELLA]);
  });

  test("org chart can show previous years via the year parameter", async () => {
    const t = await setup();
    // Backfill a 2020 structure directly (admins can only write current/next).
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: 2020, name: "Old Division" });
      await ctx.db.insert("departments", {
        year: 2020,
        name: "Old Marketing",
        division: "Old Division",
        headEmail: HENRY,
      });
      await ctx.db.insert("staffProfiles", {
        email: HENRY,
        year: 2020,
        roles: ["Head of Department"],
        department: "Old Marketing",
      });
    });

    const past = await asUser(t, RACHEL).query(api.directory.orgChart, {
      year: 2020,
    });
    expect(past.year).toBe(2020);
    expect(past.availableYears).toContain(2020);
    expect(past.availableYears).toContain(YEAR);
    expect(past.divisions.map((d) => d.name)).toEqual(["Old Division"]);
    expect(past.divisions[0].departments[0].head?.email).toBe(HENRY);

    // Defaults to the current year when no year is given.
    const current = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    expect(current.year).toBe(YEAR);
  });

  test("profiles: own church is editable, service history spans years, others can view", async () => {
    const t = await setup();
    // Rachel has signed in before (users row exists, with the Google photo)
    // and served in 2025 too.
    const rachelUserId = await t.run(async (ctx) => {
      // Deliberately uses the legacy single-role field: rolesOf() must
      // normalise old documents written before roles became an array.
      await ctx.db.insert("staffProfiles", {
        email: RACHEL,
        year: YEAR - 1,
        role: "Staff",
        department: "Events",
      });
      return await ctx.db.insert("users", {
        email: RACHEL,
        name: "Rachel R",
        image: "https://lh3.googleusercontent.com/google-default",
      });
    });

    // updateChurch resolves the caller's users row from the auth subject.
    const rachelSignedIn = t.withIdentity({
      email: RACHEL,
      subject: `${rachelUserId}|session1`,
      issuer: "test",
    });
    await rachelSignedIn.mutation(api.profile.updateChurch, {
      localChurch: "SOW City Church",
    });

    // Henry views Rachel's profile from the org chart.
    const viewed = await asUser(t, HENRY).query(api.profile.get, { email: RACHEL });
    expect(viewed.isMe).toBe(false);
    expect(viewed.name).toBe("Rachel R");
    expect(viewed.localChurch).toBe("SOW City Church");
    expect(viewed.serviceHistory).toEqual([
      { year: YEAR, roles: ["Staff"], department: "Marketing", division: null },
      { year: YEAR - 1, roles: ["Staff"], department: "Events", division: null },
    ]);

    // Rachel's own view is editable (isMe) but role/department come from
    // staffProfiles — profile mutations expose no way to change them.
    const own = await rachelSignedIn.query(api.profile.get, {});
    expect(own.isMe).toBe(true);
    expect(own.photo).toBe("https://lh3.googleusercontent.com/google-default");

    // Uploading her own photo replaces the Google default everywhere.
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["fake-image"], { type: "image/png" }))
    );
    await rachelSignedIn.mutation(api.profile.setAvatar, { storageId });
    const updated = await asUser(t, HENRY).query(api.profile.get, { email: RACHEL });
    expect(updated.photo).not.toBe("https://lh3.googleusercontent.com/google-default");
    expect(updated.photo).toBeTruthy();

    // The org chart shows the uploaded photo too.
    const chart = await asUser(t, HENRY).query(api.directory.orgChart, {});
    const marketing = chart.divisions
      .flatMap((d) => d.departments)
      .find((d) => d.name === "Marketing");
    const rachelInChart = marketing?.members.find((m) => m.email === RACHEL);
    expect(rachelInChart?.photo).toBe(updated.photo);
  });

  test("the synced Workspace directory powers the admin picker", async () => {
    const t = await setup();
    // A sync stored three org members (one already has a profile).
    await t.mutation(internal.directorySync.store, {
      users: [
        { email: RACHEL, name: "Rachel R" },
        { email: "newbie@sow.org.au", name: "New B" },
        { email: "fresh@sow.org.au" },
      ],
    });
    const directory = await asUser(t, ADMIN).query(api.directorySync.list, {
      year: YEAR,
    });
    expect(directory.syncedAt).toBeTruthy();
    expect(directory.status).toBe("synced 3 people");
    expect(
      directory.users.filter((u) => !u.hasProfile).map((u) => u.email)
    ).toEqual(["newbie@sow.org.au", "fresh@sow.org.au"]);
    expect(directory.users.find((u) => u.email === RACHEL)?.hasProfile).toBe(true);

    // A later sync replaces the list wholesale.
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "only@sow.org.au" }],
    });
    const replaced = await asUser(t, ADMIN).query(api.directorySync.list, {
      year: YEAR,
    });
    expect(replaced.users.map((u) => u.email)).toEqual(["only@sow.org.au"]);

    // Only admins can view or trigger the sync.
    await expect(
      asUser(t, RACHEL).query(api.directorySync.list, { year: YEAR })
    ).rejects.toThrow(/Only admins/);
    await expect(
      asUser(t, RACHEL).mutation(api.directorySync.requestSync, {})
    ).rejects.toThrow(/Only admins/);
  });

  test("an unexpected sign-in is unassigned, visible to admins, and assignable", async () => {
    const t = await setup();
    // Walter signed in with Google but no admin ever provisioned him.
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: "walter@sow.org.au", name: "Walter W" });
    });
    const walter = asUser(t, "walter@sow.org.au");

    // He gets the unassigned experience, not an error.
    const me = await walter.query(api.directory.me, {});
    expect(me?.profile).toBeNull();
    // ...and can't touch the request flow.
    await expect(
      walter.mutation(api.requests.submit, { description: "x", amount: 10 })
    ).rejects.toThrow(/No role\/department/);

    // Admins see him in the unassigned list and can assign him.
    const admin = asUser(t, ADMIN);
    const before = await admin.query(api.admin.listUnassignedUsers, { year: YEAR });
    expect(before.map((u) => u.email)).toContain("walter@sow.org.au");
    await admin.mutation(api.admin.setStaffProfile, {
      email: "walter@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    const after = await admin.query(api.admin.listUnassignedUsers, { year: YEAR });
    expect(after.map((u) => u.email)).not.toContain("walter@sow.org.au");

    // Now the flow works for him.
    await walter.mutation(api.requests.submit, { description: "x", amount: 10 });
    expect(await walter.query(api.requests.myRequests, {})).toHaveLength(1);

    // Provisioned-but-next-year-lapsed people show as unassigned for that year.
    const nextYear = await admin.query(api.admin.listUnassignedUsers, {
      year: YEAR + 1,
    });
    expect(nextYear.map((u) => u.email)).toContain("walter@sow.org.au");
  });

  test("sign-in binds profiles to the user id; an email rename re-keys everything", async () => {
    const t = await setup();
    // Rachel has a request in flight, heads nothing, has a push token.
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    await asUser(t, RACHEL).mutation(api.push.register, { token: "ExponentPushToken[r]" });
    // Bella is the Budget Manager; give her a users row and bind on sign-in.
    const bellaUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: BELLA, name: "Bella B" })
    );
    await t.mutation(internal.userLink.link, { userId: bellaUserId });
    const bound = await t.run(async (ctx) =>
      (await ctx.db.query("staffProfiles").take(100)).find((p) => p.email === BELLA)
    );
    expect(bound?.userId).toBe(bellaUserId);

    // Rachel signs in, binds, then her Google email is renamed.
    const rachelUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: RACHEL, name: "Rachel R" })
    );
    await t.mutation(internal.userLink.link, { userId: rachelUserId });
    await t.run((ctx) =>
      ctx.db.patch("users", rachelUserId, { email: "rachel.renamed@sow.org.au" })
    );
    await t.mutation(internal.userLink.link, { userId: rachelUserId });

    // Her profile, request and push token all follow the new email...
    const renamed = asUser(t, "rachel.renamed@sow.org.au");
    const mine = await renamed.query(api.requests.myRequests, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].requesterEmail).toBe("rachel.renamed@sow.org.au");
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(tokens.find((tk) => tk.token === "ExponentPushToken[r]")?.email).toBe(
      "rachel.renamed@sow.org.au"
    );
    // ...and the old email is now a stranger.
    await expect(
      asUser(t, RACHEL).query(api.requests.myRequests, {})
    ).rejects.toThrow(/No role\/department/);

    // Headships and the Budget Manager assignment re-key too.
    const fionaUserId = await t.run((ctx) =>
      ctx.db.insert("users", { email: FIONA, name: "Fiona F" })
    );
    await t.mutation(internal.userLink.link, { userId: fionaUserId });
    await t.run((ctx) =>
      ctx.db.patch("users", fionaUserId, { email: "fiona.new@sow.org.au" })
    );
    await t.mutation(internal.userLink.link, { userId: fionaUserId });
    const structure = await asUser(t, ADMIN).query(api.directory.yearStructure, {
      year: YEAR,
    });
    expect(
      structure.departments.find((d) => d.name === "Finance")?.headEmail
    ).toBe("fiona.new@sow.org.au");
    // The renamed Finance Head can still approve.
    const [request] = await renamed.query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, "fiona.new@sow.org.au").mutation(api.requests.approve, {
      requestId: request._id,
      step: "financeHead",
    });
  });

  test("push tokens register per device and follow account switches", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.push.register, {
      token: "ExponentPushToken[abc]",
    });
    // Same device re-registers under a different account.
    await asUser(t, HENRY).mutation(api.push.register, {
      token: "ExponentPushToken[abc]",
    });
    const tokens = await t.run((ctx) => ctx.db.query("pushTokens").take(10));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].email).toBe(HENRY);
  });

  test("staff year rolls over on September 1st", () => {
    expect(staffYearForDate(new Date("2026-06-11"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-08-31"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-01"))).toBe(2027);
    expect(staffYearForDate(new Date("2026-12-31"))).toBe(2027);
  });
});

describe("audit trail and reminders", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("the audit trail records who actioned each step, in order", async () => {
    const t = await setup();
    // Henry's own request: HOD auto-approved at submission.
    await asUser(t, HENRY).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await asUser(t, HENRY).query(api.requests.myRequests, {});
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });
    await asUser(t, HENRY).mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [{ accountName: "H", bsb: "0", accountNumber: "1", amount: 90 }],
    });
    await asUser(t, FIONA).mutation(api.requests.pay, { requestId: request._id, paidAmount: 90 });

    const trail = await asUser(t, RACHEL).query(api.requests.auditTrail, {
      requestId: request._id,
    });
    expect(trail.map((e) => [e.action, e.step, e.actor])).toEqual([
      ["submitted", null, HENRY],
      ["auto-approved", "hod", HENRY],
      ["approved", "budgetManager", BELLA],
      ["approved", "financeHead", FIONA],
      ["receipt-submitted", null, HENRY],
      ["paid", null, FIONA],
    ]);
    expect(trail.every((e) => typeof e.at === "number")).toBe(true);
    expect(trail[5].detail).toBe("$90");

    // Decline reasons land in the trail too.
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "y", amount: 50 });
    const [declined] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: declined._id, step: "hod", reason: "Too dear",
    });
    const declinedTrail = await asUser(t, RACHEL).query(api.requests.auditTrail, {
      requestId: declined._id,
    });
    expect(declinedTrail.at(-1)).toMatchObject({
      action: "declined", step: "hod", actor: HENRY, detail: "Too dear",
    });
  });

  test("departments with members or open requests can't be deleted", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Members assigned -> refuse.
    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" })
    ).rejects.toThrow(/still has staff/);

    // Members gone but an open request remains -> still refuse.
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 40 });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.decline, {
      requestId: request._id, step: "hod", reason: "no",
    });
    await admin.mutation(api.admin.removeStaffProfile, { email: RACHEL, year: YEAR });
    await admin.mutation(api.admin.removeStaffProfile, { email: HENRY, year: YEAR });
    await admin.mutation(api.admin.removeStaffProfile, { email: DAN, year: YEAR });

    // The only request is completed (declined), members are gone -> allowed.
    await admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Marketing" });
    const structure = await admin.query(api.directory.yearStructure, { year: YEAR });
    expect(structure.departments.map((d) => d.name)).not.toContain("Marketing");

    // And a department with an OPEN request can't be removed.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "eve@sow.org.au", year: YEAR, roles: ["Staff"], department: "Events",
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await asUser(t, "eve@sow.org.au").mutation(api.requests.submit, {
      description: "open", amount: 30,
    });
    await admin.mutation(api.admin.removeStaffProfile, { email: "eve@sow.org.au", year: YEAR });
    await expect(
      admin.mutation(api.admin.removeDepartment, { year: YEAR, name: "Events" })
    ).rejects.toThrow(/open requests/);
  });

  test("next-approver notifications fall back to the current year's officeholder", () => {
    const carriedOver = {
      requesterEmail: RACHEL,
      department: "Marketing",
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "PENDING",
      approvedByDirector: undefined,
      approvedByFinanceHead: "PENDING",
    } as never as Parameters<typeof nextApproverEmail>[0];
    // Last year's Budget Manager is gone (no assignment recorded).
    const lastYear = { hodEmail: HENRY, budgetManagerEmail: undefined, financeHeadEmail: undefined };
    const thisYear = { hodEmail: HENRY, budgetManagerEmail: BELLA, financeHeadEmail: FIONA };
    expect(nextApproverEmail(carriedOver, lastYear, thisYear)).toBe(BELLA);
    // The request-year officeholder wins when they still exist.
    expect(
      nextApproverEmail(carriedOver, { ...lastYear, budgetManagerEmail: "olga@sow.org.au" }, thisYear)
    ).toBe("olga@sow.org.au");
    // No step pending -> nobody to notify.
    expect(
      nextApproverEmail(
        { ...carriedOver, approvedByBudgetManager: "APPROVED", approvedByFinanceHead: "APPROVED" } as never,
        lastYear,
        thisYear
      )
    ).toBeUndefined();
  });

  test("chain notifications target the relevant approvers only", () => {
    const approvers = {
      hodEmail: HENRY,
      budgetManagerEmail: BELLA,
      financeHeadEmail: FIONA,
      directorEmail: DAN,
    };
    const base = {
      requesterEmail: RACHEL,
      department: "Marketing",
      approvedByHOD: "APPROVED",
      approvedByBudgetManager: "APPROVED",
      approvedByDirector: undefined,
      approvedByFinanceHead: "PENDING",
    } as never as Parameters<typeof involvedApproverEmails>[0];

    // Approved-so-far (decline/cancel audience): HOD + BM, no Director step.
    expect(involvedApproverEmails(base, approvers, ["APPROVED"])).toEqual([
      HENRY,
      BELLA,
    ]);
    // Finance department requests have no HOD step to report on.
    expect(
      involvedApproverEmails(
        { ...base, department: "Finance" } as never,
        approvers,
        ["APPROVED"]
      )
    ).toEqual([BELLA]);
    // The requester is never notified as an approver (their own steps).
    expect(
      involvedApproverEmails(
        { ...base, requesterEmail: HENRY } as never,
        approvers,
        ["APPROVED"]
      )
    ).toEqual([BELLA]);
  });

  test("requests.get serves the detail screen for any signed-in staff member", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    const seen = await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    });
    expect(seen?._id).toBe(request._id);
    // A cancelled request resolves to null (the screen shows a notice).
    await asUser(t, RACHEL).mutation(api.requests.cancel, { requestId: request._id });
    const gone = await asUser(t, HENRY).query(api.requests.get, {
      requestId: request._id,
    });
    expect(gone).toBeNull();
  });

  test("stale requests trigger a weekly reminder to whoever they wait on", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});

    // Fresh request: no reminder.
    await t.mutation(internal.reminders.remindStale, {});
    let updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeUndefined();

    // Eight days later it's stale (waiting on Henry's HOD approval).
    vi.useFakeTimers({ now: Date.now(), toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    const firstReminder = updated?.lastReminderAt;
    expect(firstReminder).toBeDefined();

    // Running again the same day doesn't re-nag...
    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBe(firstReminder);

    // ...but another week of silence earns another nudge.
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    await t.mutation(internal.reminders.remindStale, {});
    updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.lastReminderAt).toBeGreaterThan(firstReminder!);
  });
});

describe("deadlock prevention and validation fixes", () => {
  test("submit is rejected while the year has no Budget Manager", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Marketing", division: "Engagement", headEmail: HENRY,
    });
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Finance", division: "Governance", headEmail: FIONA,
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: RACHEL, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 })
    ).rejects.toThrow(/Budget Manager/);
  });

  test("a >= $5000 request is rejected while the org has no Director", async () => {
    const t = await setup();
    // Dan steps down: nobody holds the Director role any more.
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: DAN, year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, { description: "big", amount: 6000 })
    ).rejects.toThrow(/Director/);
    // Small requests don't need a Director and still work.
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "small", amount: 100 });
  });

  test("removing the Budget Manager's profile clears the assignment", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.removeStaffProfile, { email: BELLA, year: YEAR });
    const structure = await admin.query(api.directory.yearStructure, { year: YEAR });
    expect(structure.budgetManagerEmail).toBeNull();
  });

  test("receipts and payments must have positive amounts", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await rachel.query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    await expect(
      rachel.mutation(api.requests.submitReceipt, {
        requestId: request._id,
        recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 0 }],
      })
    ).rejects.toThrow(/positive/);

    await rachel.mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 95 }],
    });
    await expect(
      asUser(t, FIONA).mutation(api.requests.pay, { requestId: request._id, paidAmount: 0 })
    ).rejects.toThrow(/positive/);
  });

  test("in-flight previous-year requests survive the rollover end to end", async () => {
    const t = await setup();
    // Last year's org chart: the same people held the roles.
    await t.run(async (ctx) => {
      await ctx.db.insert("divisions", { year: YEAR - 1, name: "Engagement" });
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Marketing", division: "Engagement", headEmail: HENRY,
      });
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Finance", division: "Governance", headEmail: FIONA,
      });
      await ctx.db.insert("yearSettings", { year: YEAR - 1, budgetManagerEmail: BELLA });
      await ctx.db.insert("requests", {
        year: YEAR - 1,
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "carried over",
        amount: 300,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      });
    });

    // Still visible to the requester...
    const mine = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    expect(mine.some((r) => r.year === YEAR - 1)).toBe(true);

    // ...and actionable by last year's approvers, all the way to payment.
    const review = await asUser(t, BELLA).query(api.requests.toReview, {});
    const carried = review.budgetManager.find((r) => r.year === YEAR - 1);
    expect(carried).toBeDefined();
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: carried!._id, step: "budgetManager",
    });
    await asUser(t, FIONA).mutation(api.requests.approve, {
      requestId: carried!._id, step: "financeHead",
    });
    await asUser(t, RACHEL).mutation(api.requests.submitReceipt, {
      requestId: carried!._id,
      recipients: [{ accountName: "R", bsb: "0", accountNumber: "1", amount: 300 }],
    });
    const fionaReview = await asUser(t, FIONA).query(api.requests.toReview, {});
    expect(fionaReview.readyToPay.map((r) => r._id)).toContain(carried!._id);
    await asUser(t, FIONA).mutation(api.requests.pay, {
      requestId: carried!._id, paidAmount: 300,
    });
    const paidDoc = await t.run((ctx) => ctx.db.get("requests", carried!._id));
    expect(paidDoc?.paid).toBe(true);
    // Once completed, carry-overs drop out of the active lists (archive).
    const after = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    expect(after.find((r) => r._id === carried!._id)).toBeUndefined();
  });

  test("declining requires a reason", async () => {
    const t = await setup();
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    await expect(
      asUser(t, HENRY).mutation(api.requests.decline, {
        requestId: request._id, step: "hod", reason: "   ",
      })
    ).rejects.toThrow(/reason/);
  });

  test("the Director and the HR division head are admins; other division heads aren't", async () => {
    const t = await setup();
    // Dan (Director) can manage staff assignments.
    await asUser(t, DAN).mutation(api.admin.setStaffProfile, {
      email: "new@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    // The Head of the Human Resources division is an admin...
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "hrhead@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Human Resources",
    });
    await asUser(t, "hrhead@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "new2@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
    });
    // ...but the Head of the Engagement division is not.
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "enghead@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Engagement",
    });
    await expect(
      asUser(t, "enghead@sow.org.au").mutation(api.admin.setStaffProfile, {
        email: "new3@sow.org.au", year: YEAR, roles: ["Staff"], department: "Marketing",
      })
    ).rejects.toThrow(/Only admins/);
  });

  test("a carried-over request whose approver left can be actioned by this year's officeholder", async () => {
    const t = await setup();
    // Last year's Budget Manager (olga) is gone — no profile this year.
    await t.run(async (ctx) => {
      await ctx.db.insert("departments", {
        year: YEAR - 1, name: "Marketing", division: "Engagement", headEmail: HENRY,
      });
      await ctx.db.insert("yearSettings", {
        year: YEAR - 1, budgetManagerEmail: "olga@sow.org.au",
      });
      await ctx.db.insert("requests", {
        year: YEAR - 1,
        requesterEmail: RACHEL,
        department: "Marketing",
        description: "stranded",
        amount: 120,
        approvedByHOD: "APPROVED",
        approvedByBudgetManager: "PENDING",
        approvedByFinanceHead: "PENDING",
      });
    });
    // This year's Budget Manager (bella) sees and approves it.
    const review = await asUser(t, BELLA).query(api.requests.toReview, {});
    const stranded = review.budgetManager.find((r) => r.description === "stranded");
    expect(stranded).toBeDefined();
    await asUser(t, BELLA).mutation(api.requests.approve, {
      requestId: stranded!._id, step: "budgetManager",
    });
  });

  test("receipts support multiple recipients with multiple attachments each", async () => {
    const t = await setup();
    const rachel = asUser(t, RACHEL);
    await rachel.mutation(api.requests.submit, { description: "x", amount: 300 });
    const [request] = await rachel.query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    // Two receipt files for the first recipient, one for the second.
    const [fileA, fileB, fileC] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["receipt-a"], { type: "application/pdf" })),
      await ctx.storage.store(new Blob(["receipt-b"], { type: "image/png" })),
      await ctx.storage.store(new Blob(["receipt-c"], { type: "application/pdf" })),
    ]);
    await rachel.mutation(api.requests.submitReceipt, {
      requestId: request._id,
      recipients: [
        {
          accountName: "Rachel",
          bsb: "111-111",
          accountNumber: "1",
          amount: 200,
          attachments: [
            { storageId: fileA, name: "flights.pdf" },
            { storageId: fileB, name: "hotel.png" },
          ],
        },
        {
          accountName: "Vendor Pty Ltd",
          bsb: "222-222",
          accountNumber: "2",
          amount: 100,
          attachments: [{ storageId: fileC, name: "invoice.pdf" }],
        },
      ],
    });

    // Total sums across recipients.
    const updated = await t.run((ctx) => ctx.db.get("requests", request._id));
    expect(updated?.receipt?.totalAmount).toBe(300);

    // The Finance Head sees signed URLs grouped per recipient...
    const receipts = await asUser(t, FIONA).query(api.requests.receiptAttachments, {
      requestId: request._id,
    });
    expect(receipts).toHaveLength(2);
    expect(receipts[0].attachments.map((a) => a.name)).toEqual([
      "flights.pdf",
      "hotel.png",
    ]);
    expect(receipts[1].attachments[0].url).toBeTruthy();

    // ...the requester can view them too, but unrelated staff cannot.
    await rachel.query(api.requests.receiptAttachments, { requestId: request._id });
    await expect(
      asUser(t, HENRY).query(api.requests.receiptAttachments, { requestId: request._id })
    ).rejects.toThrow(/can't view/);
  });

  test("requests can be submitted on behalf of another department", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    // Events has no head yet, so submitting for it hits the deadlock guard.
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x", amount: 100, department: "Events",
      })
    ).rejects.toThrow(/Head for the Events/);

    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await admin.mutation(api.admin.setStaffProfile, {
      email: "evan@sow.org.au", year: YEAR, roles: ["Head of Department"], department: "Events",
    });
    await asUser(t, RACHEL).mutation(api.requests.submit, {
      description: "conference", amount: 100, department: "Events",
    });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    expect(request.department).toBe("Events");
    expect(request.approvedByHOD).toBe("PENDING");

    // Events' head reviews it; Rachel's own HOD (Marketing) does not.
    const evanReview = await asUser(t, "evan@sow.org.au").query(api.requests.toReview, {});
    expect(evanReview.hod.map((r) => r._id)).toContain(request._id);
    const henryReview = await asUser(t, HENRY).query(api.requests.toReview, {});
    expect(henryReview.hod).toHaveLength(0);

    // Unknown departments are rejected.
    await expect(
      asUser(t, RACHEL).mutation(api.requests.submit, {
        description: "x", amount: 10, department: "Nope",
      })
    ).rejects.toThrow(/doesn't exist/);
  });

  test("a division head submitting outside their division gets a normal HOD step", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "diana@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Operations",
    });
    // Marketing is in Engagement — not Diana's division — so Henry approves.
    await asUser(t, "diana@sow.org.au").mutation(api.requests.submit, {
      description: "x", amount: 60, department: "Marketing",
    });
    const [request] = await asUser(t, "diana@sow.org.au").query(api.requests.myRequests, {});
    expect(request.department).toBe("Marketing");
    expect(request.approvedByHOD).toBe("PENDING");
  });

  test("a person can hold multiple roles (division head + department head)", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "maria@sow.org.au",
      year: YEAR,
      roles: ["Head of Division", "Head of Department"],
      division: "Engagement",
      department: "Marketing",
    });
    // Org chart: heads the Engagement division AND appears in Marketing.
    const chart = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    const engagement = chart.divisions.find((d) => d.name === "Engagement");
    expect(engagement?.head?.email).toBe("maria@sow.org.au");
    const marketing = engagement?.departments.find((d) => d.name === "Marketing");
    expect(marketing?.members.map((m) => m.email)).toContain("maria@sow.org.au");

    // Department-based roles still require a department.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au",
        year: YEAR,
        roles: ["Head of Division", "Staff"],
        division: "Engagement",
      })
    ).rejects.toThrow(/Department/);

    // Her own requests file under her department; as a division head she
    // has no HOD above her.
    const maria = asUser(t, "maria@sow.org.au");
    await maria.mutation(api.requests.submit, { description: "x", amount: 50 });
    const [request] = await maria.query(api.requests.myRequests, {});
    expect(request.department).toBe("Marketing");
    expect(request.approvedByHOD).toBe("APPROVED");
  });

  test("Finance dept head can also head the Operations division; Governance division head works", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Fiona: Head of Department (Finance) + Head of Division (Operations).
    await admin.mutation(api.admin.setStaffProfile, {
      email: FIONA,
      year: YEAR,
      roles: ["Head of Department", "Head of Division"],
      department: "Finance",
      division: "Operations",
    });
    const chart = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    expect(chart.divisions.find((d) => d.name === "Operations")?.head?.email).toBe(FIONA);
    expect(
      chart.divisions
        .find((d) => d.name === "Governance")
        ?.departments.find((d) => d.name === "Finance")?.head?.email
    ).toBe(FIONA);

    // She is still the Finance Head approver for the whole org...
    await asUser(t, RACHEL).mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await asUser(t, RACHEL).query(api.requests.myRequests, {});
    await asUser(t, HENRY).mutation(api.requests.approve, { requestId: request._id, step: "hod" });
    await asUser(t, BELLA).mutation(api.requests.approve, { requestId: request._id, step: "budgetManager" });
    await asUser(t, FIONA).mutation(api.requests.approve, { requestId: request._id, step: "financeHead" });

    // ...and can submit on behalf of an Operations department she oversees.
    await admin.mutation(api.admin.upsertDepartment, {
      year: YEAR, name: "Events", division: "Operations", headEmail: "evan@sow.org.au",
    });
    await asUser(t, FIONA).mutation(api.requests.submit, {
      description: "ops gear", amount: 100, department: "Events",
    });
    const fionaRequests = await asUser(t, FIONA).query(api.requests.myRequests, {});
    expect(fionaRequests.find((r) => r.department === "Events")?.approvedByHOD).toBe("APPROVED");

    // Head of Division for Governance: org chart placement + her own request
    // defaults to a Governance department with the HOD step skipped (she
    // outranks its head), then waits on the Budget Manager as normal.
    await admin.mutation(api.admin.setStaffProfile, {
      email: "gina@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Governance",
    });
    const chart2 = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    expect(chart2.divisions.find((d) => d.name === "Governance")?.head?.email).toBe(
      "gina@sow.org.au"
    );
    await asUser(t, "gina@sow.org.au").mutation(api.requests.submit, {
      description: "governance", amount: 80,
    });
    const [ginaRequest] = await asUser(t, "gina@sow.org.au").query(api.requests.myRequests, {});
    expect(ginaRequest.department).toBe("Compliance"); // first Governance dept
    expect(ginaRequest.approvedByHOD).toBe("APPROVED");
    expect(ginaRequest.approvedByBudgetManager).toBe("PENDING");
  });

  test("Heads of Division belong to a division and skip the HOD step", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await admin.mutation(api.admin.setStaffProfile, {
      email: "diana@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Engagement",
    });
    // Shown as the division's head on the org chart.
    const chart = await asUser(t, RACHEL).query(api.directory.orgChart, {});
    expect(chart.divisions.find((d) => d.name === "Engagement")?.head?.email).toBe(
      "diana@sow.org.au"
    );
    // Her requests default to a department under her division (first
    // alphabetically: Alumni), with no HOD step pending — she outranks it.
    const diana = asUser(t, "diana@sow.org.au");
    await diana.mutation(api.requests.submit, { description: "x", amount: 100 });
    const [request] = await diana.query(api.requests.myRequests, {});
    expect(request.department).toBe("Alumni");
    expect(request.approvedByHOD).toBe("APPROVED");
    expect(request.approvedByBudgetManager).toBe("PENDING");
    // The division must exist for the year.
    await expect(
      admin.mutation(api.admin.setStaffProfile, {
        email: "x@sow.org.au", year: YEAR, roles: ["Head of Division"], division: "Nope",
      })
    ).rejects.toThrow(/division/);
  });
});
