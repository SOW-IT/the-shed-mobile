import { expect, test } from "vitest";
import { tagName } from "../../shared/world";
import { lineWhere, pickView, saidLabel } from "./view";

test("offline or Android always shows the list; otherwise VoiceOver picks it", () => {
  expect(pickView({ offline: true, screenReader: false })).toBe("list");
  expect(pickView({ offline: false, screenReader: true })).toBe("list");
  expect(pickView({ offline: false, screenReader: false })).toBe("garden");
  expect(pickView({ offline: false, screenReader: false, canDraw: false })).toBe("list");
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

test("a leave line from another place says where they left; a join line names it once", () => {
  const base = { isMe: false, name: "Ben Smith", text: "left", kind: "leave" as const };
  expect(saidLabel({ ...base, here: true, place: "garden" })).toBe(`${tagName("Ben Smith")} left`);
  expect(saidLabel({ ...base, here: false, place: "chapel" })).toBe(`${tagName("Ben Smith")} left The Chapel`);
  expect(saidLabel({ ...base, here: false })).toBe(`${tagName("Ben Smith")} left, elsewhere`);
  const join = { ...base, text: "joined The Chapel", kind: "join" as const, here: false, place: "chapel" };
  expect(saidLabel(join)).toBe(`${tagName("Ben Smith")} joined The Chapel`);
});
