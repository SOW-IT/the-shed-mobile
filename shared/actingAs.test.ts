import { describe, expect, test } from "vitest";
import {
  ALL_VIEWS,
  countWaiting,
  departmentHighlights,
  personaApproves,
  personaApprovesForm,
  personaDepartment,
  personaHighlights,
  personaHoldsStep,
  personaLabel,
  personaReviewsEvents,
  personaSeesForm,
  personaSeesRequest,
  samePersona,
  seesThrough,
  SELF_LENS,
  waitsThrough,
  type Persona,
} from "./actingAs";

const MARKETING_STAFF: Persona = { role: "staff", department: "Marketing" };
const MARKETING_HEAD: Persona = { role: "head", department: "Marketing" };
const FINANCE_HEAD: Persona = { role: "head", department: "Finance" };
const DIRECTOR: Persona = { role: "director" };
const BUDGET_MANAGER: Persona = { role: "budgetManager" };

describe("personas", () => {
  test("labels use the year's title for the Director", () => {
    expect(personaLabel(MARKETING_STAFF)).toBe("Marketing staff");
    expect(personaLabel(MARKETING_HEAD)).toBe("Marketing Head");
    expect(personaLabel(BUDGET_MANAGER)).toBe("Budget Manager");
    expect(personaLabel(DIRECTOR)).toBe("Director");
    expect(personaLabel(DIRECTOR, { Director: "Executive Director" })).toBe("Executive Director");
  });

  test("the Budget Manager sits in Finance and the Director in no department", () => {
    expect(personaDepartment(MARKETING_HEAD)).toBe("Marketing");
    expect(personaDepartment(BUDGET_MANAGER)).toBe("Finance");
    expect(personaDepartment(DIRECTOR)).toBeNull();
    expect(personaApproves(MARKETING_STAFF)).toBe(false);
    expect(personaApproves(MARKETING_HEAD)).toBe(true);
  });

  test("the same choice matches whatever object it came in", () => {
    expect(samePersona(null, null)).toBe(true);
    expect(samePersona(null, DIRECTOR)).toBe(false);
    expect(samePersona(MARKETING_STAFF, { role: "staff", department: "Marketing" })).toBe(true);
    expect(samePersona(MARKETING_STAFF, MARKETING_HEAD)).toBe(false);
    expect(samePersona(MARKETING_STAFF, { role: "staff", department: "Events" })).toBe(false);
  });

  test("highlights say what each choice opens up", () => {
    expect(departmentHighlights("Marketing")).toEqual(["Design requests", "Marketing forms"]);
    expect(departmentHighlights("Finance")).toEqual(["All reimbursements", "Finance forms"]);
    expect(departmentHighlights("Compliance")).toEqual(["Risk forms"]);
    expect(departmentHighlights("Events")).toEqual([]);
    expect(personaHighlights(DIRECTOR)).toEqual(["Director approvals"]);
    expect(personaHighlights(BUDGET_MANAGER)).toEqual([
      "Budget approvals",
      "All reimbursements",
      "Finance forms",
    ]);
    expect(personaHighlights(MARKETING_HEAD)).toEqual(["Design requests", "Marketing forms"]);
  });
});

describe("reimbursement steps", () => {
  const request = {
    department: "Events",
    approvedByHOD: "PENDING" as const,
    approvedByBudgetManager: "PENDING" as const,
    approvedByFinanceHead: "PENDING" as const,
  };

  test("each step belongs to one role", () => {
    expect(personaHoldsStep({ role: "head", department: "Events" }, "hod", "Events")).toBe(true);
    expect(personaHoldsStep(FINANCE_HEAD, "hod", "Finance")).toBe(false);
    expect(personaHoldsStep(BUDGET_MANAGER, "budgetManager", "Events")).toBe(true);
    expect(personaHoldsStep(DIRECTOR, "director", "Events")).toBe(true);
    expect(personaHoldsStep(FINANCE_HEAD, "financeHead", "Events")).toBe(true);
    expect(personaHoldsStep(MARKETING_HEAD, "financeHead", "Events")).toBe(false);
  });

  test("a request is seen by Finance and by whoever holds a step on it", () => {
    expect(personaSeesRequest({ role: "staff", department: "Finance" }, request)).toBe(true);
    expect(personaSeesRequest({ role: "head", department: "Events" }, request)).toBe(true);
    expect(personaSeesRequest(MARKETING_HEAD, request)).toBe(false);
    expect(personaSeesRequest(DIRECTOR, request)).toBe(false);
    expect(personaSeesRequest(DIRECTOR, { ...request, approvedByDirector: "PENDING" })).toBe(true);
  });
});

describe("event forms", () => {
  test("each team sees its own forms; the Director sees the Finance form at its step", () => {
    expect(personaReviewsEvents(MARKETING_STAFF)).toBe(true);
    expect(personaReviewsEvents(DIRECTOR)).toBe(true);
    expect(personaReviewsEvents({ role: "staff", department: "Events" })).toBe(false);
    expect(personaSeesForm(MARKETING_STAFF, "marketing", undefined)).toBe(true);
    expect(personaSeesForm(MARKETING_STAFF, "risk", undefined)).toBe(false);
    expect(personaSeesForm(DIRECTOR, "finance", "director")).toBe(true);
    expect(personaSeesForm(DIRECTOR, "finance", "financeHead")).toBe(false);
    expect(personaSeesForm(BUDGET_MANAGER, "finance", "director")).toBe(true);
    expect(personaApprovesForm(MARKETING_HEAD, "marketing", undefined)).toBe(true);
    expect(personaApprovesForm(MARKETING_STAFF, "marketing", undefined)).toBe(false);
    expect(personaApprovesForm(DIRECTOR, "finance", "director")).toBe(true);
    expect(personaApprovesForm(FINANCE_HEAD, "finance", "director")).toBe(false);
  });
});

test("only rows waiting on you count towards a badge", () => {
  expect(countWaiting()).toBe(0);
  expect(countWaiting([{ waiting: true }, { waiting: false }], [{ waiting: true }])).toBe(2);
});

describe("lenses", () => {
  const as = { kind: "as" as const, persona: MARKETING_STAFF };
  const inMarketing = (p: Persona) => personaDepartment(p) === "Marketing";

  test("All views sees everything but waits only on what is really yours", async () => {
    expect(await seesThrough(ALL_VIEWS, () => false, inMarketing)).toBe(true);
    expect(await waitsThrough(ALL_VIEWS, () => false, inMarketing)).toBe(false);
  });

  test("acting as someone follows their role, and no lens follows your own", async () => {
    expect(await seesThrough(as, () => false, inMarketing)).toBe(true);
    expect(await waitsThrough(as, () => false, inMarketing)).toBe(true);
    expect(await seesThrough(as, () => true, () => false)).toBe(false);
    expect(await waitsThrough(as, () => true, () => false)).toBe(false);
    expect(await seesThrough(SELF_LENS, async () => false, inMarketing)).toBe(false);
    expect(await waitsThrough(SELF_LENS, () => true, inMarketing)).toBe(true);
  });
});
