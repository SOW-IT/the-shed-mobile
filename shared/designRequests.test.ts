import { describe, expect, test } from "vitest";
import {
  changedDesignAnswers,
  designAnswersProblem,
  designRequestFiling,
  designRequestName,
  formatDesignAnswer,
  formatDueDate,
  isFieldShown,
  isOpenDesignStatus,
  isValidDateString,
  MAX_ANSWER_LENGTH,
  normalizeDesignAnswers,
  otherKey,
  sydneyToday,
  type DesignAnswers,
  type DesignField,
} from "./designRequests";

const FIELDS: DesignField[] = [
  { key: "department", kind: "department", label: "Department?", shortLabel: "Department", required: true, role: "department" },
  {
    key: "types",
    kind: "checkboxes",
    label: "Type?",
    shortLabel: "Request type",
    required: true,
    options: [
      { value: "event", label: "Event-related" },
      { value: "pr", label: "PR-related" },
      { value: "other", label: "Other" },
    ],
    otherOption: "other",
    role: "title",
  },
  {
    key: "passage",
    kind: "text",
    label: "Passage?",
    shortLabel: "Bible passage",
    required: true,
    showWhen: { field: "types", includes: "event" },
    maxLength: 20,
  },
  { key: "budget", kind: "money", label: "Budget?", shortLabel: "Budget", required: true, max: 1000 },
  { key: "due", kind: "date", label: "Due?", shortLabel: "Needed by", required: true, notInPast: true, role: "dueDate" },
  { key: "drafts", kind: "yesNo", label: "Drafts?", shortLabel: "Drafts", required: true },
  { key: "notes", kind: "longText", label: "Notes?", shortLabel: "Notes", required: false },
];

const TODAY = "2030-01-01";
const complete = (over: DesignAnswers = {}): DesignAnswers => ({
  department: "Events",
  types: ["event"],
  passage: "Isaiah 6:8",
  budget: 250,
  due: "2030-01-10",
  drafts: false,
  ...over,
});

const problem = (over: DesignAnswers, previous?: DesignAnswers) =>
  designAnswersProblem(FIELDS, normalizeDesignAnswers(FIELDS, complete(over)), TODAY, previous);

describe("normalizeDesignAnswers", () => {
  test("keeps only asked questions, trimmed, with choices in form order", () => {
    expect(
      normalizeDesignAnswers(FIELDS, {
        department: "  Events ",
        types: ["pr", "nope", "event", "pr"],
        passage: " Isaiah 6:8 ",
        budget: 10.005,
        due: "2030-01-10",
        drafts: true,
        notes: "   ",
        stray: "dropped",
      })
    ).toEqual({
      department: "Events",
      types: ["event", "pr"],
      passage: "Isaiah 6:8",
      budget: 10.01,
      due: "2030-01-10",
      drafts: true,
    });
  });

  test("drops hidden questions, unchosen Other text and wrong-typed answers", () => {
    expect(
      normalizeDesignAnswers(FIELDS, {
        types: ["pr"],
        typesOther: "ignored",
        passage: "ignored",
        budget: Number.NaN,
        drafts: "yes",
        department: 4,
      })
    ).toEqual({ types: ["pr"] });
    expect(normalizeDesignAnswers(FIELDS, { types: "event" })).toEqual({});
    expect(normalizeDesignAnswers(FIELDS, { types: ["nope"] })).toEqual({});
    expect(
      normalizeDesignAnswers(FIELDS, { types: ["other"], typesOther: " Retreat " })
    ).toEqual({ types: ["other"], typesOther: "Retreat" });
  });
});

describe("designAnswersProblem", () => {
  test("complete answers have no problem", () => {
    expect(problem({})).toBeNull();
    expect(problem({ budget: 0, types: ["pr"], passage: "" })).toBeNull();
  });

  test("each missing or invalid answer names the question", () => {
    expect(problem({ department: "" })).toBe("Pick a department.");
    expect(problem({ types: [] })).toBe('Pick at least one answer for "Request type".');
    expect(problem({ types: ["other"] })).toBe('Say what "Other" is for "Request type".');
    expect(problem({ passage: "" })).toBe('Answer "Bible passage".');
    expect(problem({ passage: "x".repeat(21) })).toMatch(/at most 20 characters/);
    expect(problem({ budget: "" })).toMatch(/Enter an amount for "Budget"/);
    expect(problem({ budget: -1 })).toMatch(/Enter an amount/);
    expect(problem({ budget: 1001 })).toBe('"Budget" can be at most $1,000.');
    expect(problem({ due: "" })).toBe('Pick a date for "Needed by".');
    expect(problem({ due: "soon" })).toBe('Pick a date for "Needed by".');
    expect(problem({ due: "2029-12-31" })).toBe('"Needed by" can\'t be in the past.');
    expect(problem({ drafts: "" })).toBe('Answer "Drafts".');
    expect(problem({ notes: "x".repeat(MAX_ANSWER_LENGTH + 1) })).toMatch(/at most/);
    expect(
      problem({ types: ["other"], typesOther: "x".repeat(MAX_ANSWER_LENGTH + 1) })
    ).toMatch(/at most/);
  });

  test("a past date can stay if it's the one the request already had", () => {
    expect(problem({ due: "2029-12-31" }, { due: "2029-12-31" })).toBeNull();
    expect(problem({ due: "2029-12-30" }, { due: "2029-12-31" })).toMatch(/past/);
  });
});

describe("reading answers", () => {
  const answers = normalizeDesignAnswers(
    FIELDS,
    complete({ types: ["event", "other"], typesOther: "Retreat", notes: "Hi" })
  );
  const field = (key: string) => FIELDS.find((f) => f.key === key) as DesignField;

  test("formats each kind of answer", () => {
    expect(formatDesignAnswer(field("types"), answers)).toBe("Event-related, Other: Retreat");
    expect(formatDesignAnswer(field("budget"), answers)).toBe("$250");
    expect(formatDesignAnswer(field("due"), answers)).toBe("10 Jan 2030");
    expect(formatDesignAnswer(field("drafts"), answers)).toBe("No");
    expect(formatDesignAnswer(field("drafts"), { drafts: true })).toBe("Yes");
    expect(formatDesignAnswer(field("notes"), answers)).toBe("Hi");
    expect(formatDesignAnswer(field("notes"), {})).toBeNull();
    // A choice the form no longer offers still reads as itself.
    expect(formatDesignAnswer(field("types"), { types: ["retired"] })).toBe("retired");
    expect(formatDesignAnswer(field("types"), { types: ["other"] })).toBe("Other");
  });

  test("lists changed questions by short name, in form order", () => {
    const after = { ...answers, due: "2030-02-01", types: ["event"] };
    expect(changedDesignAnswers(FIELDS, answers, normalizeDesignAnswers(FIELDS, after))).toEqual([
      "Request type",
      "Needed by",
    ]);
    expect(changedDesignAnswers(FIELDS, answers, answers)).toEqual([]);
  });

  test("files a request under its department, due date and title", () => {
    expect(designRequestFiling(FIELDS, answers)).toEqual({
      department: "Events",
      dueDate: "2030-01-10",
      title: "Event-related, Other: Retreat",
    });
    expect(designRequestFiling([], answers)).toEqual({ department: "", dueDate: "", title: "" });
    expect(designRequestFiling(FIELDS, {})).toEqual({ department: "", dueDate: "", title: "" });
  });

  test("helpers", () => {
    expect(otherKey({ key: "items" })).toBe("itemsOther");
    expect(isFieldShown(field("passage"), { types: ["pr"] })).toBe(false);
    expect(isFieldShown(field("passage"), {})).toBe(false);
    expect(isFieldShown(field("notes"), {})).toBe(true);
  });
});

describe("dates, names and statuses", () => {
  test("dates", () => {
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(formatDueDate("2026-10-20")).toBe("20 Oct 2026");
    expect(formatDueDate("soon")).toBe("soon");
    // 2026-10-05 15:00 UTC is 6 October in Sydney.
    expect(sydneyToday(new Date(Date.UTC(2026, 9, 5, 15)))).toBe("2026-10-06");
    expect(sydneyToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("names and statuses", () => {
    expect(designRequestName({ year: 2027, number: 4 })).toBe("Design request #4 (2027)");
    expect(isOpenDesignStatus("PENDING")).toBe(true);
    expect(isOpenDesignStatus("APPROVED")).toBe(true);
    expect(isOpenDesignStatus("COMPLETED")).toBe(false);
  });
});
