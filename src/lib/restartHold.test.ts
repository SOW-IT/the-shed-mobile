import { describe, expect, test } from "vitest";
import { holdRestart, onRestartFree, restartHeld, withRestartHeld } from "./restartHold";

describe("restartHold", () => {
  test("held while a picker, share sheet or sign-in runs, even after an error", async () => {
    let resolvePicker: () => void = () => undefined;
    const picking = withRestartHeld(() => new Promise<void>((resolve) => (resolvePicker = resolve)));
    expect(restartHeld()).toBe(true);
    resolvePicker();
    await picking;
    expect(restartHeld()).toBe(false);

    await expect(withRestartHeld(() => Promise.reject(new Error("cancelled")))).rejects.toThrow("cancelled");
    expect(restartHeld()).toBe(false);
  });

  test("an open draft holds it until every hold is let go, and says so once", () => {
    let freed = 0;
    const stop = onRestartFree(() => (freed += 1));
    const releaseDraft = holdRestart();
    const releaseSheet = holdRestart();
    expect(restartHeld()).toBe(true);
    releaseDraft();
    releaseDraft();
    expect(restartHeld()).toBe(true);
    expect(freed).toBe(0);
    releaseSheet();
    expect(restartHeld()).toBe(false);
    expect(freed).toBe(1);
    stop();
    holdRestart()();
    expect(freed).toBe(1);
  });
});
