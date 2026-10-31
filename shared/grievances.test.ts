import { describe, expect, test } from "vitest";
import {
  andList,
  cleanNameList,
  DEFAULT_GRIEVANCE_CATEGORIES,
  grievanceDetailLines,
  grievanceProblem,
  grievanceRef,
  grievanceStepTrack,
  normalizeGrievance,
  type GrievanceInput,
} from "./grievances";

const SAFETY = "Safety or wellbeing";

const input = (over: Partial<GrievanceInput> = {}): GrievanceInput =>
  normalizeGrievance({
    name: " Alex Morgan ",
    email: " Alex@Example.com ",
    phone: "  ",
    category: SAFETY,
    details: " Someone was hurt at camp and nobody helped. ",
    ...over,
  });

describe("grievanceProblem", () => {
  test("normalizes and accepts a good grievance", () => {
    const g = input();
    expect(g).toMatchObject({ name: "Alex Morgan", email: "alex@example.com", phone: undefined });
    expect(grievanceProblem(g, DEFAULT_GRIEVANCE_CATEGORIES)).toBeNull();
  });

  test.each([
    [{ name: " " }, "Please enter your name."],
    [{ email: "nope" }, "Please enter a valid email address."],
    [{ email: "alex@example..com" }, "Please enter a valid email address."],
    [{ category: "gossip" }, "Please choose what it's about."],
    [{ details: "bad" }, "Please tell us what happened."],
    [{ details: "x".repeat(5001) }, '"What happened" can be at most 5000 characters.'],
    [{ campus: "x".repeat(201) }, "can be at most 200 characters each"],
    [{ hopedOutcome: "x".repeat(5001) }, "Each answer can be at most 5000 characters."],
  ])("%o → %s", (over, message) => {
    expect(grievanceProblem(input(over), DEFAULT_GRIEVANCE_CATEGORIES)).toContain(message);
  });
});

test("cleanNameList trims, drops blanks and repeats, and checks limits", () => {
  const what = { one: "option", max: 2, maxLength: 5 };
  expect(cleanNameList([" A ", "", "a", "B"], what)).toEqual({ list: ["A", "B"] });
  expect(cleanNameList([" "], what)).toEqual({ problem: "Add at least one option." });
  expect(cleanNameList(["A", "B", "C"], what)).toEqual({ problem: "There can be at most 2 options." });
  expect(cleanNameList(["Toolong"], what)).toEqual({
    problem: "Each option can be at most 5 characters.",
  });
});

test("grievanceDetailLines lists only what was answered", () => {
  expect(grievanceDetailLines(input())).toEqual([
    `About: ${SAFETY}`,
    "What happened:\nSomeone was hurt at camp and nobody helped.",
  ]);
  expect(
    grievanceDetailLines(
      input({ campus: "UNSW", happenedWhen: "Last week", peopleInvolved: "Kim", hopedOutcome: "Talk" })
    )
  ).toHaveLength(6);
  expect(grievanceRef("3f2a9c1b-0000-4000-8000-000000000000")).toBe("3F2A9C1B");
  expect([[], ["A"], ["A", "B"], ["A", "B", "C"]].map(andList)).toEqual([
    "",
    "A",
    "A and B",
    "A, B and C",
  ]);
});

describe("grievanceStepTrack", () => {
  const names = { submitter: "Alex", assignee: "Hana", closedBy: null };
  const states = (g: Parameters<typeof grievanceStepTrack>[0], n = names) =>
    grievanceStepTrack(g, n).map((s) => `${s.label}:${s.state}`);

  test("three stages", () => {
    expect(states({ status: "SUBMITTED", submittedAt: 1 })).toEqual([
      "Submitted:done",
      "In progress:current",
      "Resolved:todo",
    ]);
    expect(states({ status: "IN_PROGRESS", submittedAt: 1, inProgressAt: 2 })).toEqual([
      "Submitted:done",
      "In progress:done",
      "Resolved:current",
    ]);
    const resolved = grievanceStepTrack(
      { status: "RESOLVED", submittedAt: 1, inProgressAt: 2, closedAt: 4 },
      { ...names, closedBy: "Carl" }
    );
    expect(resolved.map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(resolved[1]).toMatchObject({ name: "Hana", at: 2 });
    expect(resolved[2]).toMatchObject({ name: "Carl", at: 4 });
  });

  test("not proceeding marks only what it reached", () => {
    expect(states({ status: "NOT_PROCEEDING", submittedAt: 1, closedAt: 2 })).toEqual([
      "Submitted:done",
      "In progress:todo",
      "Not proceeding:declined",
    ]);
    expect(
      states({ status: "NOT_PROCEEDING", submittedAt: 1, inProgressAt: 2, closedAt: 3 })
    ).toEqual(["Submitted:done", "In progress:done", "Not proceeding:declined"]);
  });
});
