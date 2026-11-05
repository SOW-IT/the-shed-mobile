import { describe, expect, test } from "vitest";
import { DEFAULT_TEAMS } from "./teams";
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
  personaSeesAllEvents,
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
    expect(personaDepartment(MARKETING_HEAD, DEFAULT_TEAMS)).toBe("Marketing");
    expect(personaDepartment(BUDGET_MANAGER, DEFAULT_TEAMS)).toBe("Finance");
    expect(personaDepartment(DIRECTOR, DEFAULT_TEAMS)).toBeNull();
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
    expect(departmentHighlights("Marketing", DEFAULT_TEAMS)).toEqual(["Design requests", "Marketing forms"]);
    expect(departmentHighlights("Finance", DEFAULT_TEAMS)).toEqual(["All reimbursements", "Finance forms"]);
    expect(departmentHighlights("Compliance", DEFAULT_TEAMS)).toEqual(["Risk forms"]);
    expect(departmentHighlights("Events", DEFAULT_TEAMS)).toEqual(["All event requests"]);
    expect(departmentHighlights("Missions", DEFAULT_TEAMS)).toEqual([]);
    expect(
      departmentHighlights("Design", { ...DEFAULT_TEAMS, design: "Design", marketingForm: "Design" })
    ).toEqual(["Design requests", "Marketing forms"]);
    expect(personaHighlights(DIRECTOR, DEFAULT_TEAMS)).toEqual(["Director approvals"]);
    expect(personaHighlights(BUDGET_MANAGER, DEFAULT_TEAMS)).toEqual([
      "Budget approvals",
      "All reimbursements",
      "Finance forms",
    ]);
    expect(personaHighlights(MARKETING_HEAD, DEFAULT_TEAMS)).toEqual(["Design requests", "Marketing forms"]);
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
    expect(personaHoldsStep({ role: "head", department: "Events" }, "hod", "Events", DEFAULT_TEAMS)).toBe(true);
    expect(personaHoldsStep(FINANCE_HEAD, "hod", "Events", DEFAULT_TEAMS)).toBe(false);
    expect(personaHoldsStep(BUDGET_MANAGER, "budgetManager", "Events", DEFAULT_TEAMS)).toBe(true);
    expect(personaHoldsStep(DIRECTOR, "director", "Events", DEFAULT_TEAMS)).toBe(true);
    expect(personaHoldsStep(FINANCE_HEAD, "financeHead", "Events", DEFAULT_TEAMS)).toBe(true);
    expect(personaHoldsStep(MARKETING_HEAD, "financeHead", "Events", DEFAULT_TEAMS)).toBe(false);
  });

  test("a request is seen by Finance and by whoever holds a step on it", () => {
    expect(personaSeesRequest({ role: "staff", department: "Finance" }, request, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesRequest({ role: "head", department: "Events" }, request, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesRequest(MARKETING_HEAD, request, DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesRequest(DIRECTOR, request, DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesRequest(DIRECTOR, { ...request, approvedByDirector: "PENDING" }, DEFAULT_TEAMS)).toBe(true);
  });
});

describe("event forms", () => {
  test("each team sees its own forms; the Director sees the Finance form at its step", () => {
    expect(personaReviewsEvents(MARKETING_STAFF, DEFAULT_TEAMS)).toBe(true);
    expect(personaReviewsEvents(DIRECTOR, DEFAULT_TEAMS)).toBe(true);
    expect(personaReviewsEvents({ role: "staff", department: "Events" }, DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesAllEvents({ role: "staff", department: "Events" }, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesAllEvents(MARKETING_STAFF, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesAllEvents(DIRECTOR, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesAllEvents({ role: "head", department: "Missions" }, DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesForm(MARKETING_STAFF, "marketing", undefined, DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesForm(MARKETING_STAFF, "risk", undefined, DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesForm(DIRECTOR, "finance", "director", DEFAULT_TEAMS)).toBe(true);
    expect(personaSeesForm(DIRECTOR, "finance", "financeHead", DEFAULT_TEAMS)).toBe(false);
    expect(personaSeesForm(BUDGET_MANAGER, "finance", "director", DEFAULT_TEAMS)).toBe(true);
    expect(personaApprovesForm(MARKETING_HEAD, "marketing", undefined, DEFAULT_TEAMS)).toBe(true);
    expect(personaApprovesForm(MARKETING_STAFF, "marketing", undefined, DEFAULT_TEAMS)).toBe(false);
    expect(personaApprovesForm(DIRECTOR, "finance", "director", DEFAULT_TEAMS)).toBe(true);
    expect(personaApprovesForm(FINANCE_HEAD, "finance", "director", DEFAULT_TEAMS)).toBe(false);
  });
});

test("only rows waiting on you count towards a badge", () => {
  expect(countWaiting()).toBe(0);
  expect(countWaiting([{ waiting: true }, { waiting: false }], [{ waiting: true }])).toBe(2);
});

describe("lenses", () => {
  const as = { kind: "as" as const, persona: MARKETING_STAFF };
  const inMarketing = (p: Persona) => personaDepartment(p, DEFAULT_TEAMS) === "Marketing";

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
