import { expect, test } from "vitest";
import { chatLineParts, placeTag } from "./chatFormat";
import { clock } from "./view";

const line = { at: Date.UTC(2026, 10, 24, 3, 15), name: "Daniel Kim", text: "hi", here: true };

test("chat lines name people in the World's one name style", () => {
  expect(chatLineParts(line, { times: false, names: "initials" }).name).toBe("DK");
  expect(chatLineParts(line, { times: false, names: "short" }).name).toBe("Daniel K.");
  expect(chatLineParts(line, { times: false, names: "full" }).name).toBe("Daniel Kim");
});

test("chat lines hide the time by default and show it when asked", () => {
  expect(chatLineParts(line, { times: false, names: "initials" })).toEqual({ time: null, place: null, name: "DK", text: "hi" });
  expect(chatLineParts(line, { times: true, names: "short" })).toEqual({ time: clock(line.at), place: null, name: "Daniel K.", text: "hi" });
});

test("a line still sending shows dots for its time, only when times are on", () => {
  expect(chatLineParts(line, { times: true, names: "initials", pending: true }).time).toBe("…");
  expect(chatLineParts(line, { times: false, names: "initials", pending: true }).time).toBeNull();
});

test("a line from another place is tagged with that place", () => {
  expect(chatLineParts({ ...line, here: false, place: "chapel" }, { times: false, names: "short" }).place).toBe("Chapel");
  expect(chatLineParts({ ...line, here: false }, { times: false, names: "short" }).place).toBe("Elsewhere");
  expect(placeTag("moon")).toBe("Elsewhere");
  expect(chatLineParts({ ...line, kind: "join", text: "joined the Garden" }, { times: false, names: "initials" })).toMatchObject({ name: "DK", text: "joined the World" });
});
