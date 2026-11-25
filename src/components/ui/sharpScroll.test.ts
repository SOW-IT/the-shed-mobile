import { expect, test } from "vitest";
import { NO_EDGE_EFFECTS, splitScrollStyle } from "./sharpScroll";

test("every edge of a panel's scroll view has the system blur turned off", () => {
  expect(NO_EDGE_EFFECTS).toEqual({ top: "hidden", right: "hidden", bottom: "hidden", left: "hidden" });
});

test("a scroll view with no style grows and shrinks like a plain one, and fills its marker", () => {
  expect(splitScrollStyle(undefined)).toEqual({ outer: { flexGrow: 1, flexShrink: 1 }, inner: { flexGrow: 1, flexShrink: 1 } });
});

test("where the scroll view sits moves to the marker; how it looks stays on the scroll view", () => {
  const { outer, inner } = splitScrollStyle({ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, opacity: 0.5, borderRadius: 4 });
  expect(outer).toEqual({ flexGrow: 1, flexShrink: 1, position: "absolute", top: 0, right: 0, bottom: 0, left: 0 });
  expect(inner).toEqual({ opacity: 0.5, borderRadius: 4, flexGrow: 1, flexShrink: 1 });
});

test("a panel list that only takes the room it needs keeps that on the marker, and its height cap on the scroll view", () => {
  const { outer, inner } = splitScrollStyle({ flexGrow: 0, maxHeight: 99 });
  expect(outer).toEqual({ flexGrow: 0, flexShrink: 1 });
  expect(inner).toEqual({ maxHeight: 99, flexGrow: 1, flexShrink: 1 });
});

test("flex on the scroll view is kept as it was, on the marker", () => {
  expect(splitScrollStyle({ flex: 1, marginTop: 8 }).outer).toEqual({ flex: 1, marginTop: 8 });
});
