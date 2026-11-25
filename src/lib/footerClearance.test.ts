import { describe, expect, test } from "vitest";
import {
  bottomLift,
  FOOTER_GAP,
  FOOTER_MIN_CLEARANCE,
  footerClearance,
  footerReach,
} from "./footerClearance";

describe("footerReach", () => {
  test("adds the gap below the footer and its offset to its height", () => {
    expect(footerReach(50)).toBe(50 + FOOTER_GAP);
    expect(footerReach(120, 54)).toBe(120 + FOOTER_GAP + 54);
  });
});

describe("footerClearance", () => {
  test("never drops below the floor, including before the footer is measured", () => {
    expect(footerClearance(0)).toBe(FOOTER_MIN_CLEARANCE);
    expect(footerClearance(40)).toBe(FOOTER_MIN_CLEARANCE);
  });

  test("clears a tall footer (button plus a multi-line note) with a gap", () => {
    const reach = footerReach(130, 54);
    expect(footerClearance(reach)).toBe(reach + FOOTER_GAP);
  });

  test("takes a caller's floor, e.g. one that includes the safe area", () => {
    expect(footerClearance(0, 34 + FOOTER_MIN_CLEARANCE)).toBe(130);
    expect(footerClearance(200, 130)).toBe(200 + FOOTER_GAP);
  });
});

describe("bottomLift", () => {
  test("a screen with the tab bar under it isn't lifted, since the tab bar already clears the home indicator", () => {
    expect(bottomLift(true, 34)).toBe(0);
  });

  test("a screen with no tab bar, like the World's Calendar, is lifted past the home indicator", () => {
    expect(bottomLift(false, 34)).toBe(34);
    expect(footerReach(50, bottomLift(false, 34))).toBe(50 + FOOTER_GAP + 34);
  });

  test("with no safe area, as on the web, nothing moves", () => {
    expect(bottomLift(false, 0)).toBe(0);
  });
});
