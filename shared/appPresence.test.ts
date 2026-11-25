import { expect, test } from "vitest";
import { APP_PING_MS, APP_WRITE_GAP_MS, IN_APP_MS, IN_APP_TICK_MS, inAppTick, shouldWriteAppSeen } from "./appPresence";

test("a heartbeat writes the first time and then once a gap has passed", () => {
  expect(shouldWriteAppSeen(undefined, 1000)).toBe(true);
  expect(shouldWriteAppSeen(1000, 1000 + APP_WRITE_GAP_MS - 1)).toBe(false);
  expect(shouldWriteAppSeen(1000, 1000 + APP_WRITE_GAP_MS)).toBe(true);
});

test("every ping writes, and a missed ping still keeps someone in the app", () => {
  expect(APP_WRITE_GAP_MS).toBeLessThan(APP_PING_MS);
  expect(IN_APP_MS).toBeGreaterThan(2 * APP_PING_MS);
});

test("the tick moves on once per tick length", () => {
  expect(inAppTick(0)).toBe(0);
  expect(inAppTick(IN_APP_TICK_MS - 1)).toBe(0);
  expect(inAppTick(IN_APP_TICK_MS)).toBe(1);
});
