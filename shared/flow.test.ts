import { describe, expect, test } from "vitest";
import {
  acronym,
  APPROVED,
  type ApprovalState,
  currentStep,
  DECLINED,
  DISPLAY_ACRONYMS,
  PENDING,
  type RequestLifecycle,
  requestCompleted,
  requestDeclined,
  requestDisplayStatus,
  requestFullyApproved,
  roleNeedsDepartment,
  roleNeedsUniversity,
  rolesNeedUniversity,
  staffYearForDate,
  stepsForRequest,
} from "./flow";

// A fully-pending base state (no Director step) to derive variants from.
const base = (over: Partial<ApprovalState> = {}): ApprovalState => ({
  approvedByHOD: PENDING,
  approvedByBudgetManager: PENDING,
  approvedByFinanceHead: PENDING,
  ...over,
});

const approvedAll = (over: Partial<RequestLifecycle> = {}): RequestLifecycle => ({
  approvedByHOD: APPROVED,
  approvedByBudgetManager: APPROVED,
  approvedByFinanceHead: APPROVED,
  ...over,
});

describe("acronyms", () => {
  test("known names map to their short form; unknown names pass through", () => {
    expect(acronym("Head of Department")).toBe("HOD");
    expect(acronym("University of New South Wales")).toBe("UNSW");
    expect(acronym("Marketing")).toBe("Marketing");
    // The table backs the helper; spot-check it stays in sync.
    expect(DISPLAY_ACRONYMS["University of Sydney"]).toBe("USYD");
  });
});

describe("role classification", () => {
  test("campus roles need a university; staff-side roles do not", () => {
    expect(roleNeedsUniversity("Student Leader")).toBe(true);
    expect(roleNeedsUniversity("President")).toBe(true);
    expect(roleNeedsUniversity("Staff")).toBe(false);
    expect(roleNeedsUniversity("Director")).toBe(false);
  });

  test("rolesNeedUniversity: campus role alone yes, staff-side override no", () => {
    expect(rolesNeedUniversity(["Student Leader"])).toBe(true);
    expect(rolesNeedUniversity(["Executive", "President"])).toBe(true);
    // Holding a staff-side role suppresses the university requirement even
    // when a campus role is also present that year.
    expect(rolesNeedUniversity(["Student Leader", "Staff"])).toBe(false);
    expect(rolesNeedUniversity(["Staff"])).toBe(false);
    expect(rolesNeedUniversity([])).toBe(false);
  });

  test("most roles need a department; Head of Division, Member and campus roles do not", () => {
    expect(roleNeedsDepartment("Staff")).toBe(true);
    expect(roleNeedsDepartment("Director")).toBe(true);
    expect(roleNeedsDepartment("Head of Division")).toBe(false);
    expect(roleNeedsDepartment("Member")).toBe(false);
    expect(roleNeedsDepartment("Student Leader")).toBe(false);
  });
});

describe("staffYearForDate", () => {
  test("rolls over on 1 September", () => {
    expect(staffYearForDate(new Date("2026-06-11"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-08-31"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-01"))).toBe(2027);
    expect(staffYearForDate(new Date("2026-12-31"))).toBe(2027);
  });
});

describe("approval predicates", () => {
  test("requestDeclined is true when any step is declined", () => {
    expect(requestDeclined(base())).toBe(false);
    expect(requestDeclined(base({ approvedByHOD: DECLINED }))).toBe(true);
    expect(requestDeclined(base({ approvedByFinanceHead: DECLINED }))).toBe(true);
    expect(requestDeclined(base({ approvedByDirector: DECLINED }))).toBe(true);
  });

  test("requestFullyApproved respects the optional Director step", () => {
    expect(requestFullyApproved(approvedAll())).toBe(true);
    // Director step present and approved.
    expect(requestFullyApproved(approvedAll({ approvedByDirector: APPROVED }))).toBe(true);
    // Director step present but still pending.
    expect(requestFullyApproved(approvedAll({ approvedByDirector: PENDING }))).toBe(false);
    expect(requestFullyApproved(base())).toBe(false);
  });
});

describe("requestDisplayStatus covers every lifecycle branch", () => {
  test("DECLINED wins over everything", () => {
    expect(requestDisplayStatus(approvedAll({ approvedByHOD: DECLINED, paid: true }))).toBe(
      "DECLINED"
    );
  });
  test("PAID once paid", () => {
    expect(requestDisplayStatus(approvedAll({ paid: true, receipt: {} }))).toBe("PAID");
  });
  test("AWAITING APPROVAL while not fully approved", () => {
    expect(requestDisplayStatus(base())).toBe("AWAITING APPROVAL");
  });
  test("AWAITING RECEIPT once approved but no receipt", () => {
    expect(requestDisplayStatus(approvedAll())).toBe("AWAITING RECEIPT");
  });
  test("AWAITING PAYMENT once a receipt is in but unpaid", () => {
    expect(requestDisplayStatus(approvedAll({ receipt: {}, paid: false }))).toBe(
      "AWAITING PAYMENT"
    );
  });
});

describe("requestCompleted", () => {
  test("complete when declined or paid, otherwise open", () => {
    expect(requestCompleted(base())).toBe(false);
    expect(requestCompleted(approvedAll({ paid: true }))).toBe(true);
    expect(requestCompleted(base({ approvedByBudgetManager: DECLINED }))).toBe(true);
  });
});

describe("stepsForRequest", () => {
  test("includes the Director step only when that field is set", () => {
    expect(stepsForRequest(base())).toEqual(["hod", "budgetManager", "financeHead"]);
    expect(stepsForRequest(base({ approvedByDirector: PENDING }))).toEqual([
      "hod",
      "budgetManager",
      "director",
      "financeHead",
    ]);
  });
});

describe("currentStep", () => {
  test("walks the chain in order and stops at the first pending step", () => {
    expect(currentStep(base())).toBe("hod");
    expect(currentStep(base({ approvedByHOD: APPROVED }))).toBe("budgetManager");
    expect(
      currentStep(
        base({
          approvedByHOD: APPROVED,
          approvedByBudgetManager: APPROVED,
          approvedByDirector: PENDING,
        })
      )
    ).toBe("director");
    expect(
      currentStep(base({ approvedByHOD: APPROVED, approvedByBudgetManager: APPROVED }))
    ).toBe("financeHead");
    // Fully approved -> nothing pending.
    expect(currentStep(approvedAll())).toBeNull();
    // Declined -> closed, no current step.
    expect(currentStep(base({ approvedByHOD: DECLINED }))).toBeNull();
  });
});
