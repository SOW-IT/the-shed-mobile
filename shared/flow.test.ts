import { describe, expect, test } from "vitest";
import {
  acronym,
  APPROVED,
  type ApprovalState,
  currentStep,
  DECLINED,
  DISPLAY_ACRONYMS,
  formatAssignment,
  PENDING,
  type RequestLifecycle,
  requestCompleted,
  requestDeclined,
  requestDisplayStatus,
  requestFullyApproved,
  eventStaffYear,
  roleNeedsDepartment,
  roleNeedsUniversity,
  rolesNeedUniversity,
  staffYearForDate,
  staffYearStartMs,
  sydneyCalendarYear,
  stepsForRequest,
  withinRolloverAuthGrace,
} from "./flow";

describe("formatAssignment", () => {
  test("renders role -> scope with acronyms; bare role when no scope", () => {
    expect(formatAssignment({ role: "Head of Department", department: "Finance" })).toBe(
      "HOD → Finance"
    );
    // Chaplaincy roles are scoped to a campus; the "Chaplaincy" department is
    // dropped from the label so it reads as just the campus.
    expect(
      formatAssignment({
        role: "Senior Chaplain",
        department: "Chaplaincy",
        university: "University of Sydney",
      })
    ).toBe("Senior Chaplain → USYD");
    // A non-chaplain role scoped to Chaplaincy keeps its department, so the
    // scope isn't dropped down to a bare role label.
    expect(
      formatAssignment({ role: "Head of Department", department: "Chaplaincy" })
    ).toBe("HOD → Chaplaincy");
    expect(formatAssignment({ role: "Member" })).toBe("Member");
  });
});

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

  test("most roles need a department; Head of Division, Member, Director and campus roles do not", () => {
    expect(roleNeedsDepartment("Staff")).toBe(true);
    expect(roleNeedsDepartment("Director")).toBe(false);
    expect(roleNeedsDepartment("Head of Division")).toBe(false);
    expect(roleNeedsDepartment("Member")).toBe(false);
    expect(roleNeedsDepartment("Student Leader")).toBe(false);
  });
});

describe("staffYearForDate", () => {
  test("rolls over on 1 October", () => {
    expect(staffYearForDate(new Date("2026-06-11"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-30"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-10-01"))).toBe(2027);
    expect(staffYearForDate(new Date("2026-12-31"))).toBe(2027);
  });

  test("rolls over at Sydney midnight (Australia/Sydney), not UTC midnight", () => {
    // 13:59 UTC on Sep 30 is still 23:59 Sep 30 in Sydney → old year.
    expect(staffYearForDate(new Date("2026-09-30T13:59:00Z"))).toBe(2026);
    // 14:00 UTC on Sep 30 is 00:00 Oct 1 in Sydney → new year.
    expect(staffYearForDate(new Date("2026-09-30T14:00:00Z"))).toBe(2027);
  });
});

describe("eventStaffYear", () => {
  test("derives the staff year from a start-date epoch (start-date wins)", () => {
    expect(eventStaffYear(Date.parse("2026-09-30T13:59:00Z"))).toBe(2026);
    expect(eventStaffYear(Date.parse("2026-09-30T14:00:00Z"))).toBe(2027);
    expect(eventStaffYear(Date.parse("2026-06-11T00:00:00Z"))).toBe(2026);
  });
});

describe("staffYearStartMs", () => {
  test("is the first instant of the staff year (Sydney midnight Oct 1)", () => {
    // Staff year 2027 begins at 00:00 Oct 1 2026 Sydney = Sep 30 2026 14:00 UTC.
    expect(staffYearStartMs(2027)).toBe(Date.parse("2026-09-30T14:00:00Z"));
    expect(eventStaffYear(staffYearStartMs(2027))).toBe(2027);
    expect(eventStaffYear(staffYearStartMs(2027) - 1)).toBe(2026);
  });

  test("bounds a contiguous start-date window for each staff year", () => {
    // Every date in [start(Y), start(Y+1)) derives to Y, and only those.
    for (const year of [2025, 2026, 2027]) {
      expect(eventStaffYear(staffYearStartMs(year))).toBe(year);
      expect(eventStaffYear(staffYearStartMs(year + 1) - 1)).toBe(year);
    }
  });
});

describe("withinRolloverAuthGrace", () => {
  test("is true for the first week after Sydney midnight Oct 1", () => {
    const start = staffYearStartMs(2027);
    expect(withinRolloverAuthGrace(2027, new Date(start))).toBe(true);
    expect(withinRolloverAuthGrace(2027, new Date(start + 3 * 24 * 60 * 60 * 1000))).toBe(
      true
    );
    expect(withinRolloverAuthGrace(2027, new Date(start + 7 * 24 * 60 * 60 * 1000))).toBe(
      false
    );
    expect(withinRolloverAuthGrace(2027, new Date(start - 1))).toBe(false);
  });
});

describe("sydneyCalendarYear", () => {
  test("returns the Sydney calendar year, mid-year", () => {
    expect(sydneyCalendarYear(new Date("2026-06-15"))).toBe(2026);
  });

  test("rolls over at Sydney midnight on Jan 1 (Australia/Sydney)", () => {
    // Jan 1 in Sydney is inside daylight saving (AEDT, +11), so Sydney
    // midnight Jan 1 2026 is 13:00 UTC on Dec 31 2025.
    expect(sydneyCalendarYear(new Date("2025-12-31T12:59:00Z"))).toBe(2025);
    expect(sydneyCalendarYear(new Date("2025-12-31T13:00:00Z"))).toBe(2026);
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
