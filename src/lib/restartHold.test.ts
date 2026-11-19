import { describe, expect, test } from "vitest";
import {
  holdRestart,
  MIN_AWAY_BEFORE_RESTART_MS,
  readyToRestart,
  restartHeld,
  withRestartHeld,
} from "./restartHold";

const LEFT = 1_000_000;

describe("readyToRestart", () => {
  test("only once the app was left long enough ago", () => {
    expect(readyToRestart(null, LEFT + MIN_AWAY_BEFORE_RESTART_MS)).toBe(false);
    expect(readyToRestart(LEFT, LEFT + MIN_AWAY_BEFORE_RESTART_MS - 1)).toBe(false);
    expect(readyToRestart(LEFT, LEFT + MIN_AWAY_BEFORE_RESTART_MS)).toBe(true);
  });

  test("never while a picker, share sheet or sign-in holds it, even after an error", async () => {
    let resolvePicker: () => void = () => undefined;
    const picking = withRestartHeld(() => new Promise<void>((resolve) => (resolvePicker = resolve)));
    expect(restartHeld()).toBe(true);
    expect(readyToRestart(LEFT, LEFT + MIN_AWAY_BEFORE_RESTART_MS)).toBe(false);
    resolvePicker();
    await picking;
    expect(restartHeld()).toBe(false);

    await expect(withRestartHeld(() => Promise.reject(new Error("cancelled")))).rejects.toThrow("cancelled");
    expect(restartHeld()).toBe(false);
    expect(readyToRestart(LEFT, LEFT + MIN_AWAY_BEFORE_RESTART_MS)).toBe(true);
  });

  test("an open draft holds it however long the app was away, until the draft closes", () => {
    const releaseDraft = holdRestart();
    const releaseSheet = holdRestart();
    expect(readyToRestart(LEFT, LEFT + 6 * MIN_AWAY_BEFORE_RESTART_MS)).toBe(false);
    releaseDraft();
    releaseDraft();
    expect(readyToRestart(LEFT, LEFT + 6 * MIN_AWAY_BEFORE_RESTART_MS)).toBe(false);
    releaseSheet();
    expect(restartHeld()).toBe(false);
    expect(readyToRestart(LEFT, LEFT + 6 * MIN_AWAY_BEFORE_RESTART_MS)).toBe(true);
  });
});
