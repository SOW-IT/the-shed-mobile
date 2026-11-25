import { expect, test } from "vitest";
import { shortName } from "../../shared/names";
import { canDrawOn, lineWhere, pickView, saidLabel, systemLine } from "./view";

test("offline, a screen reader or a phone that can't draw it shows the list", () => {
  expect(pickView({ offline: true, screenReader: false })).toBe("list");
  expect(pickView({ offline: false, screenReader: true })).toBe("list");
  expect(pickView({ offline: false, screenReader: false })).toBe("garden");
  expect(pickView({ offline: false, screenReader: false, canDraw: false })).toBe("list");
});

test("Android 10 and later draw the World; older Android gets the list", () => {
  expect(canDrawOn("android", 34)).toBe(true);
  expect(canDrawOn("android", 29)).toBe(true);
  expect(canDrawOn("android", 28)).toBe(false);
  expect(canDrawOn("ios", "18.0")).toBe(true);
  expect(canDrawOn("web", "")).toBe(true);
  expect(pickView({ offline: false, screenReader: false, canDraw: canDrawOn("android", 35) })).toBe("garden");
});

test("a line from another place says where it was said, for screen readers too", () => {
  const base = { isMe: false, name: "Ben", text: "hi" };
  expect(saidLabel({ ...base, here: true, place: "garden" })).toBe("Ben said hi");
  expect(saidLabel({ ...base, here: false, place: "chapel" })).toBe("Ben said hi, in The Chapel");
  expect(saidLabel({ ...base, here: false })).toBe("Ben said hi, elsewhere");
  expect(saidLabel({ ...base, isMe: true, here: true })).toBe("You said hi");
  expect(lineWhere({ here: true, place: "chapel" })).toBeNull();
  expect(lineWhere({ here: false, place: "moon" })).toBe("elsewhere");
});

test("a leave line from another place says where they left; a join line says the World", () => {
  const base = { isMe: false, name: "Ben Smith", text: "left", kind: "leave" as const };
  expect(saidLabel({ ...base, here: true, place: "garden" })).toBe(`${shortName("Ben Smith")} left`);
  expect(saidLabel({ ...base, here: false, place: "chapel" })).toBe(`${shortName("Ben Smith")} left The Chapel`);
  expect(saidLabel({ ...base, here: false })).toBe(`${shortName("Ben Smith")} left, elsewhere`);
  const join = { ...base, text: "joined the World", kind: "join" as const, here: false, place: "chapel" };
  expect(saidLabel(join)).toBe(`${shortName("Ben Smith")} joined the World`);
});

test("join lines say they joined the World, older ones that named a place too", () => {
  const line = { isMe: false, name: "Ben Smith", here: true, place: "garden", kind: "join" as const };
  expect(systemLine({ ...line, text: "joined the Garden" })).toBe(`${shortName("Ben Smith")} joined the World`);
  expect(systemLine({ ...line, text: "joined the Café" })).toBe(`${shortName("Ben Smith")} joined the World`);
  expect(systemLine({ ...line, text: "came in" })).toBe(`${shortName("Ben Smith")} came in`);
  expect(systemLine({ ...line, text: "left", kind: "leave" })).toBe(`${shortName("Ben Smith")} left`);
  expect(systemLine({ name: "Ben Smith", text: "joined the band" })).toBe(`${shortName("Ben Smith")} joined the band`);
});
