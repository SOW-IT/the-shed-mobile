import { describe, expect, test } from "vitest";
import {
  CHECK_INTERVAL_MS,
  checkDue,
  latestOf,
  previewFromSearch,
  runUpdate,
  startPreview,
  subscribeUpdatePhase,
  updateButtonFor,
  updatePhase,
} from "./otaUpdateButton";
import { restartHeld } from "./restartHold";

const phone = { dev: false, web: false };
const heardBack = { available: false, checked: true, answered: true, inFlight: null };
const downloadable = { ...heardBack, available: true, version: "2.12.40" };

describe("updateButtonFor", () => {
  test("restarts into an update for this build, whatever the server recommends", () => {
    for (const status of ["ok", "recommended", "required", undefined] as const) {
      expect(updateButtonFor({ ...phone, ota: downloadable, status, latest: "2.12.38" })).toBe("restart");
    }
  });

  test("restarts into an update that's downloaded but not applied", () => {
    expect(updateButtonFor({ ...phone, ota: { ...heardBack, available: true }, status: "ok", latest: null })).toBe(
      "restart"
    );
  });

  test("restarts even when the update doesn't reach the recommended version, never the store", () => {
    const old = { ...downloadable, version: "2.12.37" };
    expect(updateButtonFor({ ...phone, ota: old, status: "recommended", latest: "2.13.0" })).toBe("restart");
  });

  test("the store when the phone is behind and nothing over the air reaches it", () => {
    expect(updateButtonFor({ ...phone, ota: heardBack, status: "recommended", latest: "2.13.0" })).toBe("store");
    expect(updateButtonFor({ ...phone, ota: heardBack, status: "required", latest: "2.13.0" })).toBe("store");
  });

  test("the store when this build has over-the-air updates off and is behind", () => {
    expect(updateButtonFor({ ...phone, ota: null, status: "recommended", latest: "2.13.0" })).toBe("store");
  });

  test("nothing while the phone is still asking the update server", () => {
    const asking = { ...heardBack, checked: false, answered: false };
    expect(updateButtonFor({ ...phone, ota: asking, status: "recommended", latest: "2.13.0" })).toBeNull();
  });

  test("nothing while a retry runs after a failed check, then the store once it answers", () => {
    const retrying = { ...heardBack, answered: false, inFlight: "check" as const };
    expect(updateButtonFor({ ...phone, ota: retrying, status: "required", latest: "2.13.0" })).toBeNull();
    expect(updateButtonFor({ ...phone, ota: heardBack, status: "required", latest: "2.13.0" })).toBe("store");
  });

  test("the store stays put while a regular check runs after an answer", () => {
    const rechecking = { ...heardBack, inFlight: "check" as const };
    expect(updateButtonFor({ ...phone, ota: rechecking, status: "recommended", latest: "2.13.0" })).toBe("store");
  });

  test("nothing while a download runs, but a known update is still a restart", () => {
    const downloading = { ...heardBack, inFlight: "download" as const };
    expect(updateButtonFor({ ...phone, ota: downloading, status: "recommended", latest: "2.13.0" })).toBeNull();
    const fetching = { ...downloadable, inFlight: "download" as const };
    expect(updateButtonFor({ ...phone, ota: fetching, status: "recommended", latest: "2.13.0" })).toBe("restart");
  });

  test("nothing when up to date", () => {
    expect(updateButtonFor({ ...phone, ota: heardBack, status: "ok", latest: "2.13.0" })).toBeNull();
    expect(updateButtonFor({ ...phone, ota: heardBack, status: undefined, latest: null })).toBeNull();
    expect(updateButtonFor({ ...phone, ota: null, status: "ok", latest: null })).toBeNull();
  });

  test("never in a dev build or on the web", () => {
    for (const where of [
      { dev: true, web: false },
      { dev: false, web: true },
    ]) {
      expect(updateButtonFor({ ...where, ota: downloadable, status: "ok", latest: null })).toBeNull();
      expect(updateButtonFor({ ...where, ota: null, status: "required", latest: "2.13.0" })).toBeNull();
    }
  });
});

describe("checkDue", () => {
  const at = 1_000_000;

  test("checks when nothing has been asked yet", () => {
    expect(checkDue(null, at)).toBe(true);
  });

  test("at most once per interval", () => {
    expect(checkDue(at, at + CHECK_INTERVAL_MS - 1)).toBe(false);
    expect(checkDue(at, at + CHECK_INTERVAL_MS)).toBe(true);
  });

  test("an interval between 10 and 15 minutes", () => {
    expect(CHECK_INTERVAL_MS).toBeGreaterThanOrEqual(10 * 60_000);
    expect(CHECK_INTERVAL_MS).toBeLessThanOrEqual(15 * 60_000);
  });

  test("counts from the latest of our own ask and the phone's own check", () => {
    expect(latestOf(null, undefined)).toBeNull();
    expect(latestOf(at, null)).toBe(at);
    expect(latestOf(null, at)).toBe(at);
    expect(latestOf(at, at + 5)).toBe(at + 5);
    expect(latestOf(at + 5, at)).toBe(at + 5);
    expect(checkDue(latestOf(at, at + CHECK_INTERVAL_MS), at + CHECK_INTERVAL_MS + 1)).toBe(false);
  });
});

describe("previewFromSearch", () => {
  test("reads each state from otaPreview", () => {
    expect(previewFromSearch("?otaPreview=restart")).toEqual({ kind: "restart", phase: "idle" });
    expect(previewFromSearch("?otaPreview=updating")).toEqual({ kind: "restart", phase: "updating" });
    expect(previewFromSearch("?otaPreview=failed")).toEqual({ kind: "restart", phase: "failed" });
    expect(previewFromSearch("?otaPreview=store")).toEqual({ kind: "store", phase: "idle" });
  });

  test("nothing for anything else", () => {
    expect(previewFromSearch(undefined)).toBeNull();
    expect(previewFromSearch("")).toBeNull();
    expect(previewFromSearch("?otaPreview=constructor")).toBeNull();
    expect(previewFromSearch("?other=restart")).toBeNull();
  });
});

describe("runUpdate", () => {
  test("one update at a time, held from the automatic restart, and tappable again after a failure", async () => {
    const seen: string[] = [];
    const unsubscribe = subscribeUpdatePhase(() => seen.push(updatePhase()));
    startPreview(null);
    startPreview({ kind: "restart", phase: "idle" });
    expect(updatePhase()).toBe("idle");

    let fail: (error: Error) => void = () => undefined;
    let calls = 0;
    const restart = () => {
      calls += 1;
      return new Promise<void>((_, reject) => (fail = reject));
    };
    runUpdate(restart);
    runUpdate(restart);
    expect(calls).toBe(1);
    expect(updatePhase()).toBe("updating");
    expect(restartHeld()).toBe(true);

    fail(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();
    expect(updatePhase()).toBe("failed");
    expect(restartHeld()).toBe(false);

    runUpdate(restart);
    expect(calls).toBe(2);
    expect(updatePhase()).toBe("updating");
    fail(new Error("offline"));
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual(["updating", "failed", "updating", "failed"]);

    unsubscribe();
    startPreview({ kind: "restart", phase: "updating" });
    expect(seen).toHaveLength(4);
    expect(updatePhase()).toBe("updating");
  });
});
