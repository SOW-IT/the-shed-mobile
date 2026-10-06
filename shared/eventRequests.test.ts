import { describe, expect, test } from "vitest";
import {
  eventDirectorThresholdOr,
  eventRequestName,
  eventRequestRef,
  eventSize,
  eventStatusFor,
  financeDraftProblem,
  financeNeedsDirector,
  financeNotRequired,
  financeProblem,
  financeTotals,
  highestRating,
  isSubFormDone,
  isSubFormEditable,
  isSubFormKind,
  majorRisks,
  MAX_FINANCE_LINES,
  MAX_RISK_ROWS,
  normalizeFinance,
  normalizeRisk,
  RISK_LEVELS,
  riskDraftProblem,
  riskProblem,
  riskScore,
  rowScore,
  type RiskRow,
} from "./eventRequests";

describe("statuses and sizes", () => {
  test("an event is approved once every form is approved or not required", () => {
    expect(eventStatusFor(["APPROVED", "NOT_REQUIRED", "APPROVED"])).toBe("APPROVED");
    expect(eventStatusFor(["APPROVED", "PENDING", "APPROVED"])).toBe("IN_PROGRESS");
    expect(eventStatusFor(["APPROVED", "APPROVED"])).toBe("IN_PROGRESS");
    expect(isSubFormDone("NOT_REQUIRED")).toBe(true);
    expect(isSubFormDone("CHANGES_REQUESTED")).toBe(false);
    expect(isSubFormEditable("CHANGES_REQUESTED")).toBe(true);
    expect(isSubFormEditable("PENDING")).toBe(false);
    expect(isSubFormKind("risk")).toBe(true);
    expect(isSubFormKind("registration")).toBe(false);
  });

  test("event size follows the registration goal", () => {
    expect(eventSize(undefined)).toBeNull();
    expect(eventSize(0)).toBeNull();
    expect(eventSize(49)).toBe("small");
    expect(eventSize(50)).toBe("medium");
    expect(eventSize(100)).toBe("medium");
    expect(eventSize(101)).toBe("large");
  });

  test("names and thresholds", () => {
    expect(eventRequestName({ name: "SAF26" })).toBe("Event request: SAF26");
    expect(eventRequestRef({ number: 3, year: 2027 })).toBe("#3 · 2027");
    expect(eventDirectorThresholdOr(null)).toBe(5000);
    expect(eventDirectorThresholdOr(8000)).toBe(8000);
  });
});

describe("risk", () => {
  test("scores follow the Standard's matrix", () => {
    expect(riskScore(5, 5)).toEqual({ score: 25, rating: "Extreme" });
    expect(riskScore(1, 1)).toEqual({ score: 1, rating: "Low" });
    expect(riskScore(5, 1)).toEqual({ score: 7, rating: "Moderate" });
    expect(riskScore(3, 4)).toEqual({ score: 20, rating: "High" });
    expect(riskScore(4, 4)).toEqual({ score: 21, rating: "Very High" });
    expect(riskScore(1, 5)).toEqual({ score: 17, rating: "High" });
    // Every cell has a distinct score.
    const scores = RISK_LEVELS.flatMap((l) => RISK_LEVELS.map((c) => riskScore(l, c).score));
    expect(new Set(scores).size).toBe(25);
    expect(rowScore({ description: "x", likelihood: 2 })).toBeNull();
  });

  const row = (over: Partial<RiskRow> = {}): RiskRow => ({
    description: "Trip on cables",
    category: "safety",
    consequence: 2,
    likelihood: 3,
    mitigation: "Tape them down",
    ...over,
  });

  test("normalising trims text, drops blank rows, and clears rows with no risks", () => {
    expect(
      normalizeRisk({
        noRisks: false,
        risks: [
          row({ description: "  Trip ", mitigation: "  " }),
          { description: "  ", consequence: 9, likelihood: 0 },
          { description: "", legacyRating: " High Risk " },
        ],
        contingencies: "  ",
      })
    ).toEqual({
      noRisks: false,
      risks: [
        { description: "Trip", category: "safety", consequence: 2, likelihood: 3 },
      ],
    });
    expect(normalizeRisk({ noRisks: true, risks: [row()], contingencies: " Rain " })).toEqual({
      noRisks: true,
      risks: [],
      contingencies: "Rain",
    });
  });

  test("submitting needs complete rows, and a plan for anything above Low", () => {
    const problem = (risks: RiskRow[], noRisks = false) => riskProblem({ noRisks, risks });
    expect(problem([], true)).toBeNull();
    expect(problem([])).toMatch(/Add at least one risk/);
    expect(problem([row()])).toBeNull();
    expect(problem([row({ description: "" })])).toBe("Risk 1: describe the risk.");
    expect(problem([row({ category: undefined })])).toMatch(/what kind of risk/);
    expect(problem([row({ consequence: 7 })])).toMatch(/how bad/);
    expect(problem([row({ likelihood: undefined })])).toMatch(/how likely/);
    expect(problem([row({ mitigation: undefined })])).toBe(
      "Risk 1 is rated Moderate: say how you'll reduce it."
    );
    expect(problem([row({ mitigation: undefined, consequence: 1, likelihood: 1 })])).toBeNull();
    const many = Array.from({ length: MAX_RISK_ROWS + 1 }, () => row());
    expect(problem(many)).toMatch(/at most 40 risks/);
    expect(riskDraftProblem({ noRisks: false, risks: [row({ mitigation: "x".repeat(4001) })] })).toMatch(
      /at most 4000 characters/
    );
    expect(riskDraftProblem({ noRisks: false, risks: [] })).toBeNull();
  });

  test("major risks and the highest rating", () => {
    const data = {
      noRisks: false,
      risks: [row({ category: "finance" }), row({ category: "safety", consequence: 5, likelihood: 5 })],
    };
    expect(majorRisks(data)).toEqual(["safety", "finance"]);
    expect(highestRating(data)).toBe("Extreme");
    expect(highestRating({ noRisks: false, risks: [{ description: "old", legacyRating: "Low" }] })).toBeNull();
  });
});

describe("finance", () => {
  const data = {
    income: [{ label: " Registrations ", amount: 1000.005 }],
    expenses: [
      { label: "Venue", amount: 4000.1 },
      { label: "Food", amount: 1000.2 },
      { label: "", amount: 0 },
    ],
    spreadsheetUrl: "  ",
  };

  test("normalises lines and totals in cents", () => {
    const clean = normalizeFinance(data);
    expect(clean).toEqual({
      income: [{ label: "Registrations", amount: 1000.01 }],
      expenses: [
        { label: "Venue", amount: 4000.1 },
        { label: "Food", amount: 1000.2 },
      ],
    });
    expect(financeTotals(clean)).toEqual({ income: 1000.01, expenses: 5000.3, net: -4000.29 });
    expect(normalizeFinance({ income: [{ label: "x", amount: Number.NaN }], expenses: [], spreadsheetUrl: " https://s " })).toEqual({
      income: [{ label: "x", amount: 0 }],
      expenses: [],
      spreadsheetUrl: "https://s",
    });
  });

  test("$0 needs no approval; over the threshold needs the Director", () => {
    expect(financeNotRequired({ income: [], expenses: [] })).toBe(true);
    expect(financeNotRequired({ income: [{ label: "Free", amount: 0 }], expenses: [] })).toBe(true);
    expect(financeNotRequired(normalizeFinance(data))).toBe(false);
    expect(financeNeedsDirector(normalizeFinance(data), 5000)).toBe(true);
    expect(financeNeedsDirector({ income: [], expenses: [{ label: "x", amount: 5000 }] }, 5000)).toBe(false);
  });

  test("problems", () => {
    expect(financeProblem(normalizeFinance(data))).toBeNull();
    expect(financeProblem({ income: [{ label: "", amount: 5 }], expenses: [] })).toBe(
      "Income line 1: say what it's for."
    );
    expect(financeProblem({ income: [], expenses: [{ label: "", amount: 5 }] })).toBe(
      "Expenses line 1: say what it's for."
    );
    expect(financeProblem({ income: [], expenses: [], spreadsheetUrl: "sheet" })).toMatch(/full link/);
    expect(financeProblem({ income: [], expenses: [{ label: "x", amount: -1 }] })).toMatch(/negative/);
    expect(financeDraftProblem({ income: [], expenses: [{ label: "x", amount: 2_000_000 }] })).toMatch(
      /at most \$1,000,000/
    );
    expect(financeDraftProblem({ income: [{ label: "x".repeat(4001), amount: 1 }], expenses: [] })).toMatch(
      /at most 4000/
    );
    expect(financeDraftProblem({ income: [], expenses: [], spreadsheetUrl: "x".repeat(4001) })).toMatch(
      /too long/
    );
    const many = Array.from({ length: MAX_FINANCE_LINES + 1 }, () => ({ label: "x", amount: 1 }));
    expect(financeDraftProblem({ income: many, expenses: [] })).toMatch(/at most 60 lines/);
  });
});
