import { describe, expect, test } from "vitest";
import { cardTopFor, STATUS_CARD_MS } from "./cards";

describe("a farm status card", () => {
  test("sits just above what was tapped when there's room", () => {
    expect(cardTopFor(400, 120)).toBe(322);
  });

  test("never goes under the chat log, however tall the log grows", () => {
    for (const logBottom of [0, 90, 180, 320]) {
      expect(cardTopFor(150, logBottom)).toBeGreaterThanOrEqual(logBottom);
    }
    expect(cardTopFor(150, 320)).toBe(320);
  });

  test("shows for about 3 seconds", () => {
    expect(STATUS_CARD_MS).toBe(3000);
  });
});
