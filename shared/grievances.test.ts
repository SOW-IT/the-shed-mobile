import { describe, expect, test } from "vitest";
import {
  grievanceCategoryLabel,
  grievanceDetailLines,
  grievanceProblem,
  grievanceStepTrack,
  normalizeGrievance,
  type GrievanceInput,
} from "./grievances";

const input = (over: Partial<GrievanceInput> = {}): GrievanceInput =>
  normalizeGrievance({
    name: " Alex Morgan ",
    email: " Alex@Example.com ",
    phone: "  ",
    category: "safety",
    details: " Someone was hurt at camp and nobody helped. ",
    ...over,
  });

describe("grievanceProblem", () => {
  test("normalizes and accepts a good grievance", () => {
    const g = input();
    expect(g).toMatchObject({ name: "Alex Morgan", email: "alex@example.com", phone: undefined });
    expect(grievanceProblem(g)).toBeNull();
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
    expect(grievanceProblem(input(over))).toContain(message);
  });
});

test("grievanceDetailLines lists only what was answered", () => {
  expect(grievanceDetailLines(input())).toEqual([
    "About: Safety or wellbeing",
    "What happened:\nSomeone was hurt at camp and nobody helped.",
  ]);
  expect(
    grievanceDetailLines(
      input({ campus: "UNSW", happenedWhen: "Last week", peopleInvolved: "Kim", hopedOutcome: "Talk" })
    )
  ).toHaveLength(6);
  expect(grievanceCategoryLabel("old")).toBe("old");
});

describe("grievanceStepTrack", () => {
  const names = { submitter: "Alex", assignee: "Hana", closedBy: null };
  const states = (g: Parameters<typeof grievanceStepTrack>[0], n = names) =>
    grievanceStepTrack(g, n).map((s) => `${s.label}:${s.state}`);

  test("walks through the stages", () => {
    expect(states({ status: "SUBMITTED", submittedAt: 1 })).toEqual([
      "Submitted:done",
      "Received:current",
      "In progress:todo",
      "Resolved:todo",
    ]);
    expect(states({ status: "IN_PROGRESS", submittedAt: 1, receivedAt: 2, inProgressAt: 3 })).toEqual([
      "Submitted:done",
      "Received:done",
      "In progress:done",
      "Resolved:current",
    ]);
    const resolved = grievanceStepTrack(
      { status: "RESOLVED", submittedAt: 1, receivedAt: 2, closedAt: 4 },
      { ...names, closedBy: "Carl" }
    );
    expect(resolved.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(resolved[1]).toMatchObject({ name: "Hana", at: 2 });
    expect(resolved[2]).toMatchObject({ name: null, at: null });
    expect(resolved[3]).toMatchObject({ name: "Carl", at: 4 });
  });

  test("not proceeding only marks the stages it reached", () => {
    expect(states({ status: "NOT_PROCEEDING", submittedAt: 1, closedAt: 2 })).toEqual([
      "Submitted:done",
      "Received:todo",
      "In progress:todo",
      "Not proceeding:declined",
    ]);
    expect(
      states({ status: "NOT_PROCEEDING", submittedAt: 1, receivedAt: 2, inProgressAt: 3, closedAt: 4 })
    ).toEqual(["Submitted:done", "Received:done", "In progress:done", "Not proceeding:declined"]);
  });
});
