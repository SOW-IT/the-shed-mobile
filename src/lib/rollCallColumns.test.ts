import { describe, expect, test } from "vitest";
import { footerClearance, FOOTER_MIN_CLEARANCE } from "./footerClearance";
import { ROLL_CALL_COLUMNS_MIN_HEIGHT, rollCallColumnsHeight } from "./rollCallColumns";

describe("rollCallColumnsHeight", () => {
  test("fills the window below the columns, less the footer", () => {
    expect(rollCallColumnsHeight(900, 240, 120)).toBe(540);
  });

  test("an ended event's footer on a short window still leaves the lists a height to scroll in", () => {
    // 1100x420 on web: the "This event has ended." note and Enable editing
    // button leave about 90px, which used to unbound the columns.
    const endedFooter = footerClearance(150, FOOTER_MIN_CLEARANCE);
    expect(420 - 240 - endedFooter).toBeLessThan(120);
    expect(rollCallColumnsHeight(420, 240, endedFooter)).toBe(ROLL_CALL_COLUMNS_MIN_HEIGHT);
  });

  test("never gives a height of nothing, even when the columns start below the window", () => {
    expect(rollCallColumnsHeight(400, 600, 100)).toBe(ROLL_CALL_COLUMNS_MIN_HEIGHT);
  });
});
