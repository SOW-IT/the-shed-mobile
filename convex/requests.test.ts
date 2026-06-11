/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
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
  const assignments: { email: string; role: string; department: string }[] = [
    { email: RACHEL, role: "Staff", department: "Marketing" },
    { email: HENRY, role: "Head of Department", department: "Marketing" },
    { email: BELLA, role: "Staff", department: "Finance" },
    { email: FIONA, role: "Head of Department", department: "Finance" },
    { email: DAN, role: "Director", department: "Marketing" },
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
        role: "Head of Department",
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
      role: "Staff",
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
        role: "Staff",
        department: "Marketing",
      })
    ).rejects.toThrow(/only manage/);
  });

  test("Human Resources division members are admins too", async () => {
    const t = await setup();
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "pnc@sow.org.au",
      year: YEAR,
      role: "Staff",
      department: "People and Culture", // in the Human Resources division
    });
    // The People and Culture member can now assign roles themselves.
    await asUser(t, "pnc@sow.org.au").mutation(api.admin.setStaffProfile, {
      email: "someone@sow.org.au",
      year: YEAR,
      role: "Staff",
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
      role: "Staff",
      department: "Marketing",
    });
    const structure = await admin.query(api.directory.yearStructure, { year: YEAR });
    expect(structure.budgetManagerEmail).toBeNull();
  });

  test("staff year rolls over on September 1st", () => {
    expect(staffYearForDate(new Date("2026-06-11"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-08-31"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-01"))).toBe(2027);
    expect(staffYearForDate(new Date("2026-12-31"))).toBe(2027);
  });
});
