import { expect, test } from "vitest";
import { chatLineParts, chatName, placeTag } from "./chatFormat";
import { clock } from "./view";

test("initials take the first and last names", () => {
  expect(chatName("Daniel Kim", "initials")).toBe("DK");
  expect(chatName("  sam  de la cruz ", "initials")).toBe("SC");
  expect(chatName("Sijin", "initials")).toBe("S");
  expect(chatName("émile zola", "initials")).toBe("ÉZ");
  expect(chatName("🙂 Joy", "initials")).toBe("🙂J");
  expect(chatName("   ", "initials")).toBe("?");
});

test("the name style is the first name and last initial, as everywhere else in the World", () => {
  expect(chatName("Daniel Kim", "first")).toBe("Daniel K.");
  expect(chatName("Sijin", "first")).toBe("Sijin");
  expect(chatName("Bartholomewsworth Jones", "first")).toBe("Bartholomewsw… J.");
  expect(chatName("", "first")).toBe("Someone");
});

const line = { at: Date.UTC(2026, 10, 24, 3, 15), name: "Daniel Kim", text: "hi", here: true };

test("chat lines hide the time by default and show it when asked", () => {
  expect(chatLineParts(line, { times: false, names: "initials" })).toEqual({ time: null, place: null, name: "DK", text: "hi" });
  expect(chatLineParts(line, { times: true, names: "first" })).toEqual({ time: clock(line.at), place: null, name: "Daniel K.", text: "hi" });
});

test("a line still sending shows dots for its time, only when times are on", () => {
  expect(chatLineParts(line, { times: true, names: "initials", pending: true }).time).toBe("…");
  expect(chatLineParts(line, { times: false, names: "initials", pending: true }).time).toBeNull();
});

test("a line from another place is tagged with that place", () => {
  expect(chatLineParts({ ...line, here: false, place: "chapel" }, { times: false, names: "first" }).place).toBe("Chapel");
  expect(chatLineParts({ ...line, here: false }, { times: false, names: "first" }).place).toBe("Elsewhere");
  expect(placeTag("moon")).toBe("Elsewhere");
  expect(chatLineParts({ ...line, kind: "join", text: "joined the Garden" }, { times: false, names: "initials" })).toMatchObject({ name: "DK", text: "joined the World" });
});
