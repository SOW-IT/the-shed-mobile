import { describe, expect, test } from "vitest";
import { backFrom, exitOf, padTrip } from "./homeExit";

describe("leaving a home", () => {
  test("the door leads back to the place you came from, else the Garden", () => {
    expect(exitOf({ backTo: "cafe" })).toBe("cafe");
    expect(exitOf({ backTo: "home" })).toBe("garden");
    expect(exitOf({ backTo: "backyard" })).toBe("garden");
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

  test("Back in a backyard goes in through the back door", () => {
    expect(backFrom("backyard", null, true)).toEqual({ kind: "travel", to: "home", door: true });
  });

  test("a home's front door goes back where you came from, the back door to the backyard, and the backyard's door inside", () => {
    expect(padTrip("home", "garden", { backTo: "cafe" })).toEqual({ to: "cafe", door: false });
    expect(padTrip("home", "backyard", { backTo: "cafe" })).toEqual({ to: "backyard", door: true });
    expect(padTrip("backyard", "home", null)).toEqual({ to: "home", door: true });
    expect(padTrip("garden", "beach", null)).toEqual({ to: "beach", door: false });
  });
});
