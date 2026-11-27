import { expect, test } from "vitest";
import { tripTarget } from "./tripTarget";

const none = { prop: null, seat: null, plot: null, animal: null };

test("nothing is lit when you aren't walking to anything", () => {
  expect(tripTarget(none)).toBeNull();
});

test("the plot or the animal you're walking to is lit", () => {
  expect(tripTarget({ ...none, plot: { plot: 3 } })).toEqual({ kind: "plot", plot: 3 });
  expect(tripTarget({ ...none, animal: { id: "a1" } })).toEqual({ kind: "animal", id: "a1" });
});

test("props and seats still light as before", () => {
  expect(tripTarget({ ...none, prop: { kind: "piano" } })).toEqual({ kind: "prop", id: "piano" });
  expect(tripTarget({ ...none, seat: { seatId: "s2" } })).toEqual({ kind: "seat", id: "s2" });
});
