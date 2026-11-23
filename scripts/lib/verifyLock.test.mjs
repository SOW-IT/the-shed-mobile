import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GUARD_STALE_MS, acquire, currentHolder, holderGone, ownRecord, processStart, release, tryAcquire } from "./verifyLock.mjs";

const MODULE = new URL("./verifyLock.mjs", import.meta.url).href;

let dir;
let file;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "verify-lock-test-"));
  file = join(dir, "nested", "verify.lock");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const lockOf = () => JSON.parse(readFileSync(file, "utf8"));
// A pid that was real a moment ago and has exited since.
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid;
const lockedBy = (record) => {
  tryAcquire(file, { token: "seed", ...record });
};

// Node processes that all try for the lock at `at` and then stay alive, so
// a winner can't look stale to the rest while they are still trying.
const race = (count) => {
  const at = Date.now() + 1500;
  const script = `
    import { ownRecord, tryAcquire } from ${JSON.stringify(MODULE)};
    const record = ownRecord();
    while (Date.now() < ${at}) {}
    const { ok } = tryAcquire(${JSON.stringify(file)}, record);
    console.log(ok ? "won" : "lost");
    setTimeout(() => {}, 2500);
  `;
  return Promise.all(Array.from({ length: count }, () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.on("error", reject);
    child.on("close", () => resolve(out.trim()));
  })));
};

describe("processStart and holderGone", () => {
  test("a running process has a start time and isn't gone", () => {
    expect(processStart(process.pid)).not.toBe("");
    expect(holderGone(ownRecord())).toBe(false);
  });

  test("an exited process is gone", () => {
    const pid = deadPid();
    expect(processStart(pid)).toBe("");
    expect(holderGone({ pid, started: "whenever" })).toBe(true);
  });

  test("a pid now used by a later process is gone", () => {
    expect(holderGone({ pid: process.pid, started: "Mon Jan  1 00:00:00 2001" })).toBe(true);
  });

  test("a live pid whose start time can't be read keeps its lock", () => {
    expect(holderGone({ pid: process.pid, started: "Mon Jan  1 00:00:00 2001" }, () => "")).toBe(false);
  });

  test("a record without a usable pid is gone", () => {
    expect(holderGone({})).toBe(true);
    expect(holderGone(null)).toBe(true);
    expect(holderGone({ pid: -4 })).toBe(true);
  });
});

describe("tryAcquire", () => {
  test("takes a free lock, creating its folder, and leaves no temporary file", () => {
    const record = ownRecord({ root: "/a", branch: "b" });
    expect(tryAcquire(file, record)).toEqual({ ok: true });
    expect(lockOf()).toEqual({ ...record, since: expect.any(String) });
    expect(Date.now() - Date.parse(lockOf().since)).toBeLessThan(5000);
    expect(readdirSync(join(dir, "nested"))).toEqual(["verify.lock"]);
  });

  test("a second run is told who holds it", () => {
    const first = ownRecord({ branch: "first" });
    tryAcquire(file, first);
    const result = tryAcquire(file, ownRecord({ branch: "second" }));
    expect(result).toEqual({ ok: false, holder: { ...first, since: expect.any(String) } });
    expect(currentHolder(file)?.token).toBe(first.token);
  });

  test("taking it again with the same record is a no-op", () => {
    const record = ownRecord();
    tryAcquire(file, record);
    expect(tryAcquire(file, record)).toEqual({ ok: true });
  });

  test("takes over a lock whose holder has exited", () => {
    lockedBy({ pid: deadPid(), started: "earlier" });
    expect(currentHolder(file)).toBeNull();
    const record = ownRecord();
    expect(tryAcquire(file, record)).toEqual({ ok: true });
    expect(lockOf().token).toBe(record.token);
  });

  test("takes over a lock whose pid now belongs to another process", () => {
    lockedBy({ pid: process.pid, started: "Mon Jan  1 00:00:00 2001" });
    expect(tryAcquire(file, ownRecord()).ok).toBe(true);
  });

  test("takes over a lock file nobody can read", () => {
    tryAcquire(file, ownRecord());
    writeFileSync(file, "{not json");
    expect(currentHolder(file)).toBeNull();
    expect(tryAcquire(file, ownRecord()).ok).toBe(true);
  });

  test("leaves a stale lock alone while another run's takeover is under way", () => {
    lockedBy({ pid: deadPid(), started: "earlier" });
    writeFileSync(`${file}.takeover`, JSON.stringify(ownRecord()));
    const result = tryAcquire(file, ownRecord());
    expect(result.ok).toBe(false);
    expect(lockOf().token).toBe("seed");
  });

  test("clears a takeover guard whose run died, then takes the lock on the next try", () => {
    lockedBy({ pid: deadPid(), started: "earlier" });
    writeFileSync(`${file}.takeover`, JSON.stringify({ pid: deadPid(), started: "earlier" }));
    const record = ownRecord();
    expect(tryAcquire(file, record).ok).toBe(false);
    expect(existsSync(`${file}.takeover`)).toBe(false);
    expect(tryAcquire(file, record).ok).toBe(true);
  });

  test("clears a takeover guard that is too old, even from a live pid", () => {
    lockedBy({ pid: deadPid(), started: "earlier" });
    writeFileSync(`${file}.takeover`, JSON.stringify(ownRecord()));
    const old = (Date.now() - GUARD_STALE_MS - 1000) / 1000;
    utimesSync(`${file}.takeover`, old, old);
    tryAcquire(file, ownRecord());
    expect(existsSync(`${file}.takeover`)).toBe(false);
  });

  test("only one of many runs starting at the same moment gets a free lock", async () => {
    const results = await race(8);
    expect(results.filter((r) => r === "won")).toHaveLength(1);
    expect(results.filter((r) => r === "lost")).toHaveLength(7);
  });

  test("only one of many runs takes over the same stale lock", async () => {
    lockedBy({ pid: deadPid(), started: "earlier" });
    const results = await race(8);
    expect(results.filter((r) => r === "won")).toHaveLength(1);
  });
});

describe("release", () => {
  test("gives back only its own lock, and can be called twice", () => {
    const mine = ownRecord();
    const theirs = ownRecord();
    tryAcquire(file, mine);
    release(file, theirs);
    expect(existsSync(file)).toBe(true);
    release(file, mine);
    expect(existsSync(file)).toBe(false);
    release(file, mine);
    expect(currentHolder(file)).toBeNull();
  });
});

describe("acquire", () => {
  test("waits for the holder to exit, telling the waiter who it is once", async () => {
    const holder = spawn(process.execPath, ["--input-type=module", "-e", `
      import { ownRecord, tryAcquire } from ${JSON.stringify(MODULE)};
      tryAcquire(${JSON.stringify(file)}, ownRecord({ branch: "holder" }));
      console.log("held");
      setTimeout(() => {}, 60_000);
    `], { stdio: ["ignore", "pipe", "inherit"] });
    await new Promise((resolve) => holder.stdout.once("data", resolve));
    const told = [];
    const record = ownRecord();
    const waiting = acquire(file, record, { pollMs: 50, onWait: (h) => told.push(h.branch) });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(told).toEqual(["holder"]);
    // Killed outright, so it never gave the lock back.
    holder.kill("SIGKILL");
    await waiting;
    expect(lockOf().token).toBe(record.token);
    expect(told).toEqual(["holder"]);
  });

  test("returns at once when the lock is free", async () => {
    const record = ownRecord();
    let told = 0;
    await acquire(file, record, { onWait: () => { told++; } });
    expect(told).toBe(0);
    expect(lockOf().token).toBe(record.token);
  });
});
