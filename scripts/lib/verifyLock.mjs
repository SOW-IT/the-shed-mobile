// One verify run at a time on this Mac. The simulator, the backend ports and
// Metro are shared by every worktree, so a run takes this lock before it
// touches any of them and gives it back when it stops.
//
// The lock is a file holding its holder's pid and process start time. It is
// created complete in one step (written aside, then hard-linked into place),
// so nobody reads half of it. A holder that is gone, or whose pid now belongs
// to another process, has left a stale lock that the next run takes over.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** How long a takeover may hold its guard before the guard counts as stale. */
export const GUARD_STALE_MS = 30_000;

/** When the process started, as ps prints it; "" when ps can't say. */
export const processStart = (pid) => {
  const result = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};

/**
 * Whether the process that wrote `record` is clearly gone. Unsure counts as
 * alive: a pid that exists but whose start time ps can't read keeps its lock.
 */
export const holderGone = (record, startOf = processStart) => {
  if (!Number.isInteger(record?.pid) || record.pid <= 0) return true;
  try {
    process.kill(record.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return true;
  }
  const started = startOf(record.pid);
  return started !== "" && started !== record.started;
};

/** This process's lock record. The lock file adds `since`, when it was taken. */
export const ownRecord = (details = {}, startOf = processStart) => ({
  token: randomUUID(),
  pid: process.pid,
  started: startOf(process.pid),
  ...details,
});

const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    return null; // there but unreadable: nobody can own it
  }
};

// Creates `file` holding `record`, or reports that it already exists.
const create = (file, record) => {
  const aside = `${file}.${record.token}.tmp`;
  writeFileSync(aside, JSON.stringify({ ...record, since: new Date().toISOString() }));
  try {
    linkSync(aside, file);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(aside, { force: true });
  }
};

// Removes the stale lock left by `stale`, and says whether it did. A guard
// file makes this one run's job: without it, a run that judged the old lock
// stale could delete the new lock a quicker run had just taken in its place.
// A guard left by a run that died mid-takeover is removed, and the takeover
// waits for the next poll, so it can't overlap a takeover still under way.
const takeOver = (file, stale, record, startOf) => {
  const guard = `${file}.takeover`;
  if (!create(guard, record)) {
    const other = read(guard);
    let age;
    try {
      age = Date.now() - statSync(guard).mtimeMs;
    } catch {
      return false;
    }
    if (other === null || holderGone(other, startOf) || age > GUARD_STALE_MS) rmSync(guard, { force: true });
    return false;
  }
  try {
    const now = read(file);
    // Gone already: another run may be creating its own lock right now.
    if (now === undefined) return true;
    if (now === null || now.token === stale?.token) {
      rmSync(file, { force: true });
      return true;
    }
    return false;
  } finally {
    rmSync(guard, { force: true });
  }
};

/**
 * Takes the lock if it is free or stale. Returns `{ ok: true }`, or
 * `{ ok: false, holder }` naming the run that has it (a stale holder while
 * another run is clearing its lock).
 */
export const tryAcquire = (file, record, startOf = processStart) => {
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (create(file, record)) return { ok: true };
    const holder = read(file);
    if (holder === undefined) continue; // released between the two calls
    if (holder?.token === record.token) return { ok: true };
    if (holder !== null && !holderGone(holder, startOf)) return { ok: false, holder };
    if (!takeOver(file, holder, record, startOf)) return { ok: false, holder };
  }
  return { ok: false, holder: read(file) ?? null };
};

/** The live run holding the lock, or null when it is free or stale. */
export const currentHolder = (file, startOf = processStart) => {
  const holder = read(file);
  return holder && !holderGone(holder, startOf) ? holder : null;
};

/** Gives the lock back, only if `record` still holds it. Safe to call twice. */
export const release = (file, record) => {
  if (read(file)?.token === record.token) rmSync(file, { force: true });
};

/**
 * Waits for the lock, polling. `onWait(holder)` is told who has it when the
 * wait starts, whenever the holder changes, and once a minute.
 */
export const acquire = async (file, record, { onWait = () => {}, pollMs = 2000, startOf = processStart } = {}) => {
  let told = null;
  let toldAt = 0;
  for (;;) {
    const result = tryAcquire(file, record, startOf);
    if (result.ok) return;
    const key = result.holder?.token ?? "unreadable";
    if (key !== told || Date.now() - toldAt >= 60_000) {
      onWait(result.holder);
      told = key;
      toldAt = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
};
