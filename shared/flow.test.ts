import { describe, expect, test } from "vitest";
import {
  acronym,
  ALLOWED_REACTIONS,
  APPROVED,
  type ApprovalState,
  currentStep,
  DECLINED,
  DISPLAY_ACRONYMS,
  formatAssignment,
  PENDING,
  QUICK_REACTION_EMOJIS,
  REACTION_EMOJIS,
  type RequestLifecycle,
  requestCompleted,
  requestDeclined,
  requestDisplayStatus,
  requestFullyApproved,
  eventStaffYear,
  roleNeedsDepartment,
  roleNeedsUniversity,
  rolesNeedUniversity,
  incomingStaffYear,
  staffYearForDate,
  staffYearStartMs,
  withinPrefillWindow,
  sydneyCalendarYear,
  stepsForRequest,
  universityColour,
  withinRolloverAuthGrace,
  withinRolloverRateGrace,
} from "./flow";

describe("formatAssignment", () => {
  test("renders role -> scope with acronyms; bare role when no scope", () => {
    expect(formatAssignment({ role: "Head of Department", department: "Finance" })).toBe(
      "HOD → Finance"
    );
    expect(
      formatAssignment({
        role: "Senior Chaplain",
        department: "Chaplaincy",
        university: "University of Sydney",
      })
    ).toBe("Senior Chaplain → USYD");
    expect(
      formatAssignment({ role: "Head of Department", department: "Chaplaincy" })
    ).toBe("HOD → Chaplaincy");
    expect(formatAssignment({ role: "Member" })).toBe("Member");
  });
});

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
    expect(acronym("Western Sydney University")).toBe("WSU");
    expect(acronym("Marketing")).toBe("Marketing");
    expect(DISPLAY_ACRONYMS["University of Sydney"]).toBe("USYD");
    expect(DISPLAY_ACRONYMS["Western Sydney University"]).toBe("WSU");
  });

  test("campus brand colours match the shared palette", () => {
    expect(universityColour("Western Sydney University")).toBe("#A60F2D");
    expect(universityColour("WSU")).toBe("#A60F2D");
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
    expect(staffYearForDate(new Date("2026-09-30T13:59:00Z"))).toBe(2026);
    expect(staffYearForDate(new Date("2026-09-30T14:00:00Z"))).toBe(2027);
  });

  test("falls back to fixed AEDT/AEST offsets when Intl.formatToParts is broken", () => {
    const Original = Intl.DateTimeFormat;
    // @ts-expect-error — temporary stub for the fallback path
    Intl.DateTimeFormat = function Broken() {
      throw new RangeError("Invalid time zone specified: Australia/Sydney");
    };
    try {
      expect(staffYearForDate(new Date("2026-09-30T13:59:00Z"))).toBe(2026);
      expect(staffYearForDate(new Date("2026-09-30T14:00:00Z"))).toBe(2027);
      expect(sydneyCalendarYear(new Date("2025-12-31T12:59:00Z"))).toBe(2025);
      expect(sydneyCalendarYear(new Date("2025-12-31T13:00:00Z"))).toBe(2026);
    } finally {
      Intl.DateTimeFormat = Original;
    }
  });

  test("falls back when Intl returns unusable calendar parts", () => {
    const Original = Intl.DateTimeFormat;
    // @ts-expect-error — temporary stub for the junk-parts fallback
    Intl.DateTimeFormat = function Junk() {
      return {
        formatToParts: () => [
          { type: "year", value: "0" },
          { type: "month", value: "0" },
          { type: "day", value: "0" },
          { type: "hour", value: "0" },
        ],
      };
    };
    try {
      expect(staffYearForDate(new Date("2026-09-30T14:00:00Z"))).toBe(2027);
      expect(sydneyCalendarYear(new Date("2025-12-31T13:00:00Z"))).toBe(2026);
    } finally {
      Intl.DateTimeFormat = Original;
    }
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
    expect(staffYearStartMs(2027)).toBe(Date.parse("2026-09-30T14:00:00Z"));
    expect(eventStaffYear(staffYearStartMs(2027))).toBe(2027);
    expect(eventStaffYear(staffYearStartMs(2027) - 1)).toBe(2026);
  });

  test("bounds a contiguous start-date window for each staff year", () => {
    for (const year of [2025, 2026, 2027]) {
      expect(eventStaffYear(staffYearStartMs(year))).toBe(year);
      expect(eventStaffYear(staffYearStartMs(year + 1) - 1)).toBe(year);
    }
  });
});

describe("incomingStaffYear", () => {
  test("is next before October and current from 1 Oct", () => {
    expect(incomingStaffYear(new Date("2026-09-30T13:59:00Z"))).toBe(2027);
    expect(incomingStaffYear(new Date("2026-09-30T14:00:00Z"))).toBe(2027);
    expect(incomingStaffYear(new Date("2026-06-11T00:00:00Z"))).toBe(2027);
  });
});

describe("withinPrefillWindow", () => {
  test("is 21:00–midnight Sydney on 30 Sep only", () => {
    expect(withinPrefillWindow(new Date("2026-09-30T10:59:00Z"))).toBe(false);
    expect(withinPrefillWindow(new Date("2026-09-30T11:00:00Z"))).toBe(true);
    expect(withinPrefillWindow(new Date("2026-09-30T13:59:00Z"))).toBe(true);
    expect(withinPrefillWindow(new Date("2026-09-30T14:00:00Z"))).toBe(false);
  });
});

describe("withinRolloverAuthGrace", () => {
  test("runs from Sydney midnight Oct 1 until Sydney midnight 1 Jan", () => {
    const start = staffYearStartMs(2027);
    expect(withinRolloverAuthGrace(2027, new Date(start))).toBe(true);
    expect(withinRolloverAuthGrace(2027, new Date(start + 8 * 24 * 60 * 60 * 1000))).toBe(
      true
    );
    expect(withinRolloverAuthGrace(2027, new Date("2026-12-31T12:59:00Z"))).toBe(true);
    expect(withinRolloverAuthGrace(2027, new Date("2026-12-31T13:00:00Z"))).toBe(false);
    expect(withinRolloverAuthGrace(2027, new Date(start - 1))).toBe(false);
  });
});

describe("withinRolloverRateGrace", () => {
  test("is true for the first week after Sydney midnight Oct 1", () => {
    const start = staffYearStartMs(2027);
    expect(withinRolloverRateGrace(2027, new Date(start))).toBe(true);
    expect(withinRolloverRateGrace(2027, new Date(start + 3 * 24 * 60 * 60 * 1000))).toBe(
      true
    );
    expect(withinRolloverRateGrace(2027, new Date(start + 7 * 24 * 60 * 60 * 1000))).toBe(
      false
    );
  });
});

describe("sydneyCalendarYear", () => {
  test("returns the Sydney calendar year, mid-year", () => {
    expect(sydneyCalendarYear(new Date("2026-06-15"))).toBe(2026);
  });

  test("rolls over at Sydney midnight on Jan 1 (Australia/Sydney)", () => {
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
    expect(requestFullyApproved(approvedAll({ approvedByDirector: APPROVED }))).toBe(true);
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
    expect(currentStep(approvedAll())).toBeNull();
    expect(currentStep(base({ approvedByHOD: DECLINED }))).toBeNull();
  });
});

describe("reaction catalogue", () => {
  test("validates exactly the emoji the picker offers", () => {
    expect(ALLOWED_REACTIONS.size).toBe(REACTION_EMOJIS.length);
    for (const emoji of REACTION_EMOJIS) {
      expect(ALLOWED_REACTIONS.has(emoji)).toBe(true);
    }
  });

  test("offers no quick reaction the server would reject", () => {
    for (const emoji of QUICK_REACTION_EMOJIS) {
      expect(ALLOWED_REACTIONS.has(emoji)).toBe(true);
    }
  });

  test("lists each emoji once, so the picker has no duplicate keys", () => {
    expect(new Set(REACTION_EMOJIS).size).toBe(REACTION_EMOJIS.length);
    expect(new Set(QUICK_REACTION_EMOJIS).size).toBe(QUICK_REACTION_EMOJIS.length);
  });
});
