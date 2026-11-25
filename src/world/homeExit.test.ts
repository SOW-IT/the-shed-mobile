import { describe, expect, test } from "vitest";
import { backFrom, exitOf } from "./homeExit";

describe("leaving a home", () => {
  test("the door leads back to the place you came from, else the Garden", () => {
    expect(exitOf({ backTo: "cafe" })).toBe("cafe");
    expect(exitOf({ backTo: "home" })).toBe("garden");
    expect(exitOf({ backTo: "nowhere" })).toBe("garden");
    expect(exitOf({})).toBe("garden");
    expect(exitOf(null)).toBe("garden");
    expect(exitOf(undefined)).toBe("garden");
  });

  test("Back in a home goes to the previous place, the Garden with none; anywhere else it asks to leave", () => {
    expect(backFrom("home", { backTo: "chapel" })).toEqual({ kind: "travel", to: "chapel" });
    expect(backFrom("home", undefined)).toEqual({ kind: "travel", to: "garden" });
    expect(backFrom("cafe", { backTo: "chapel" })).toEqual({ kind: "leave" });
    expect(backFrom("garden", null)).toEqual({ kind: "leave" });
  });

  test("Back in a home waits while where you came from is still loading, then goes there", () => {
    expect(backFrom("home", null, true)).toEqual({ kind: "wait" });
    expect(backFrom("home", { backTo: "chapel" }, false)).toEqual({ kind: "travel", to: "chapel" });
    expect(backFrom("home", null, false)).toEqual({ kind: "travel", to: "garden" });
    expect(backFrom("cafe", null, true)).toEqual({ kind: "leave" });
  });
});
