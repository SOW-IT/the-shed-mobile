import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  behindKey,
  CHECK_INTERVAL_MS,
  checkDue,
  freshCheckDue,
  latestOf,
  previewFromSearch,
  seenAtFor,
  updateButtonFor,
  updateButtonState,
} from "./otaUpdateButton";

const SEEN = 5_000;
const phone = { dev: false, web: false, targetSeenAt: SEEN };
const heardBack = { available: false, checked: true, answeredAt: SEEN + 1, inFlight: null };
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
    const asking = { ...heardBack, checked: false, answeredAt: null };
    expect(updateButtonFor({ ...phone, ota: asking, status: "recommended", latest: "2.13.0" })).toBeNull();
  });

  test("nothing while a retry runs after a failed check, then the store once it answers", () => {
    const retrying = { ...heardBack, answeredAt: null, inFlight: "check" as const };
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

  test("an update published after the last check: nothing until a fresh check answers, then restart or store", () => {
    const stale = { ...heardBack, answeredAt: SEEN - 60_000 };
    const behind = { ...phone, status: "recommended" as const, latest: "2.12.41" };
    expect(updateButtonFor({ ...behind, ota: stale })).toBeNull();
    expect(updateButtonFor({ ...behind, ota: { ...stale, inFlight: "check" } })).toBeNull();
    expect(updateButtonFor({ ...behind, ota: heardBack, targetSeenAt: null })).toBeNull();
    expect(updateButtonFor({ ...behind, ota: { ...heardBack, available: true, version: "2.12.41" } })).toBe("restart");
    expect(updateButtonFor({ ...behind, ota: heardBack })).toBe("store");
  });

  test("nothing when up to date", () => {
    expect(updateButtonFor({ ...phone, ota: heardBack, status: "ok", latest: "2.13.0" })).toBeNull();
    expect(updateButtonFor({ ...phone, ota: heardBack, status: undefined, latest: null })).toBeNull();
    expect(updateButtonFor({ ...phone, ota: null, status: "ok", latest: null })).toBeNull();
  });

  test("never in a dev build or on the web", () => {
    for (const where of [
      { dev: true, web: false, targetSeenAt: SEEN },
      { dev: false, web: true, targetSeenAt: SEEN },
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

describe("behind the server's version", () => {
  test("a key per status and target, none when up to date", () => {
    expect(behindKey("recommended", "2.12.41")).toBe("recommended 2.12.41");
    expect(behindKey("required", "2.12.41")).toBe("required 2.12.41");
    expect(behindKey("required", null)).toBe("required ");
    expect(behindKey("ok", "2.12.41")).toBeNull();
    expect(behindKey(undefined, null)).toBeNull();
  });

  test("when it was first seen, only for the same target", () => {
    const seen = { target: "recommended 2.12.41", at: SEEN };
    expect(seenAtFor(seen, "recommended 2.12.41")).toBe(SEEN);
    expect(seenAtFor(seen, "recommended 2.12.42")).toBeNull();
    expect(seenAtFor(seen, null)).toBeNull();
    expect(seenAtFor(null, "recommended 2.12.41")).toBeNull();
  });

  test("a fresh check once, as soon as the target moves past the last check", () => {
    const seen = { target: "recommended 2.12.41", at: SEEN };
    expect(freshCheckDue(seen, null, null)).toBe(true);
    expect(freshCheckDue(seen, SEEN - 10, SEEN - 5)).toBe(true);
    expect(freshCheckDue(seen, SEEN + 1, SEEN - 5)).toBe(false);
    expect(freshCheckDue(seen, null, SEEN + 1)).toBe(false);
    expect(freshCheckDue(null, null, null)).toBe(false);
  });
});

describe("previewFromSearch", () => {
  test("reads each state from otaPreview", () => {
    expect(previewFromSearch("?otaPreview=restart")).toEqual({ kind: "restart", phase: "idle" });
    expect(previewFromSearch("?otaPreview=updating")).toEqual({ kind: "restart", phase: "updating" });
    expect(previewFromSearch("?otaPreview=ready")).toEqual({ kind: "restart", phase: "ready" });
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

describe("updateButtonState", () => {
  const restart = { kind: "restart" as const, downloading: false, downloaded: false };

  test("Update, Updating, Update ready, Retry update, or the store", () => {
    expect(updateButtonState({ ...restart, phase: "idle" })).toBe("update");
    expect(updateButtonState({ ...restart, phase: "updating" })).toBe("updating");
    expect(updateButtonState({ ...restart, phase: "idle", downloading: true })).toBe("updating");
    expect(updateButtonState({ ...restart, phase: "ready" })).toBe("ready");
    expect(updateButtonState({ ...restart, phase: "ready", downloading: true })).toBe("ready");
    expect(updateButtonState({ ...restart, phase: "idle", downloaded: true })).toBe("ready");
    expect(updateButtonState({ ...restart, phase: "failed" })).toBe("failed");
    expect(updateButtonState({ ...restart, kind: "store", phase: "failed" })).toBe("store");
  });
});

type Controller = typeof import("./otaUpdateButton");
type Hold = typeof import("./restartHold");

const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("automatic update", () => {
  let ota: Controller;
  let hold: Hold;
  let active: boolean;
  let fetches: number;
  let reloads: number;
  let fetchResult: () => Promise<boolean>;
  let reloadResult: () => Promise<void>;
  const driver = {
    fetch: () => {
      fetches += 1;
      return fetchResult();
    },
    reload: () => {
      reloads += 1;
      return reloadResult();
    },
    isActive: () => active,
  };

  beforeEach(async () => {
    vi.resetModules();
    ota = await import("./otaUpdateButton");
    hold = await import("./restartHold");
    active = true;
    fetches = 0;
    reloads = 0;
    fetchResult = () => Promise.resolve(true);
    reloadResult = () => new Promise<void>(() => undefined);
  });

  test("an update that's found downloads, then restarts by itself", async () => {
    const seen: string[] = [];
    ota.subscribeUpdatePhase(() => seen.push(ota.updatePhase()));
    ota.downloadUpdate(driver);
    expect(ota.updatePhase()).toBe("updating");
    ota.downloadUpdate(driver);
    expect(fetches).toBe(1);
    await settle();
    expect(reloads).toBe(1);
    ota.restartWhenFree(driver);
    expect(reloads).toBe(1);
    expect(seen).toEqual(["updating", "updating"]);
  });

  test("a screen holding restarts keeps it at Update ready, then it restarts once let go", async () => {
    const release = hold.holdRestart();
    ota.downloadUpdate(driver);
    await settle();
    expect(reloads).toBe(0);
    expect(ota.updatePhase()).toBe("ready");
    ota.restartWhenFree(driver);
    expect(reloads).toBe(0);
    release();
    expect(reloads).toBe(1);
    expect(ota.updatePhase()).toBe("updating");
  });

  test("a hold let go while the app is away restarts it when you come back", async () => {
    const release = hold.holdRestart();
    ota.downloadUpdate(driver);
    await settle();
    active = false;
    release();
    expect(reloads).toBe(0);
    expect(ota.updatePhase()).toBe("ready");
    active = true;
    ota.restartWhenFree(driver);
    expect(reloads).toBe(1);
  });

  test("still held when you come back: no restart until it's let go", async () => {
    const release = hold.holdRestart();
    ota.downloadUpdate(driver);
    await settle();
    ota.restartWhenFree(driver);
    expect(reloads).toBe(0);
    release();
    expect(reloads).toBe(1);
  });

  test("a tap restarts into a downloaded update straight away, even while held", () => {
    hold.holdRestart();
    ota.updateNow(driver, true);
    expect(fetches).toBe(0);
    expect(reloads).toBe(1);
  });

  test("a tap downloads first, then restarts even while held", async () => {
    hold.holdRestart();
    ota.updateNow(driver, false);
    ota.updateNow(driver, false);
    expect(fetches).toBe(1);
    await settle();
    expect(reloads).toBe(1);
  });

  test("a failed download shows the error and the next try downloads again", async () => {
    fetchResult = () => Promise.reject(new Error("offline"));
    ota.downloadUpdate(driver);
    await settle();
    expect(ota.updatePhase()).toBe("failed");
    expect(reloads).toBe(0);
    fetchResult = () => Promise.resolve(true);
    ota.downloadUpdate(driver);
    expect(ota.updatePhase()).toBe("updating");
    await settle();
    expect(fetches).toBe(2);
    expect(reloads).toBe(1);
  });

  test("a failed restart can be tapped again", async () => {
    reloadResult = () => Promise.reject(new Error("no"));
    ota.updateNow(driver, true);
    await settle();
    expect(ota.updatePhase()).toBe("failed");
    ota.updateNow(driver, true);
    expect(reloads).toBe(2);
  });

  test("nothing new on the server leaves it as it was", async () => {
    fetchResult = () => Promise.resolve(false);
    ota.downloadUpdate(driver);
    await settle();
    expect(ota.updatePhase()).toBe("idle");
    expect(reloads).toBe(0);
  });

  test("notes the first time it sees each target", () => {
    const seen: (string | undefined)[] = [];
    ota.subscribeBehind(() => seen.push(ota.behindSnapshot()?.target));
    expect(ota.behindSnapshot()).toBeNull();
    ota.noteBehind("recommended 2.12.41", 100);
    ota.noteBehind("recommended 2.12.41", 200);
    expect(ota.behindSnapshot()).toEqual({ target: "recommended 2.12.41", at: 100 });
    ota.noteBehind("required 2.12.41", 300);
    expect(ota.behindSnapshot()).toEqual({ target: "required 2.12.41", at: 300 });
    expect(seen).toEqual(["recommended 2.12.41", "required 2.12.41"]);
  });

  test("a preview starts in its state", () => {
    ota.startPreview(null);
    ota.startPreview({ kind: "restart", phase: "idle" });
    expect(ota.updatePhase()).toBe("idle");
    ota.startPreview({ kind: "restart", phase: "ready" });
    expect(ota.updatePhase()).toBe("ready");
  });
});
