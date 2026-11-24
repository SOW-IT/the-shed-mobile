import { expect, test } from "vitest";
import { stepActorsLookup } from "./useRequestStepActors";

type StepActors = NonNullable<NonNullable<Parameters<typeof stepActorsLookup>[1]>[string]>;

const actorsNamed = (name: string): StepActors => {
  const step = {
    name,
    email: null,
    isDelegated: false,
    autoApproved: false,
    officeholderEmail: null,
    officeholderName: null,
    otherDelegateNames: [],
    actedAt: null,
  };
  return { hod: step, budgetManager: step, director: step, financeHead: step };
};
const actorsA = actorsNamed("Henry");
const actorsB = actorsNamed("Bella");

test("a card the list asked for gets its actors; a card it didn't ask for asks for its own", () => {
  const lookup = stepActorsLookup(["a", "b"], { a: actorsA }, false);
  expect(lookup("a")).toEqual({ actors: actorsA });
  // Asked for but left out of the answer: the caller can't see it.
  expect(lookup("b")).toEqual({ actors: null });
  expect(lookup("c")).toBeUndefined();
});

test("while new ids load, cards already on screen keep their actors and only new ones load", () => {
  // Load more added "c": the last answer has "a" and "b", the new one hasn't come yet.
  const lookup = stepActorsLookup(["a", "b", "c"], { a: actorsA, b: actorsB }, true);
  expect(lookup("a")).toEqual({ actors: actorsA });
  expect(lookup("b")).toEqual({ actors: actorsB });
  expect(lookup("c")).toEqual({ actors: undefined });
});

test("before any answer, every asked card reads as loading", () => {
  const lookup = stepActorsLookup(["a"], undefined, true);
  expect(lookup("a")).toEqual({ actors: undefined });
});

test("each card gets the same object every time, so an unchanged card can skip rendering", () => {
  const lookup = stepActorsLookup(["a", "b", "c"], { a: actorsA }, true);
  expect(lookup("a")).toBe(lookup("a"));
  expect(lookup("b")).toBe(lookup("c"));
  const done = stepActorsLookup(["a", "b"], { a: actorsA }, false);
  expect(done("b")).toBe(done("b"));
});
