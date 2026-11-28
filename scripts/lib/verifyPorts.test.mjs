import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ownRecord } from "./verifyLock.mjs";
import { parsePort, reservePorts } from "./verifyPorts.mjs";

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "verify-ports-test-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ROLES = [
  { name: "convex", variable: "VERIFY_CONVEX_PORT", preferred: 3270 },
  { name: "convexSite", variable: "VERIFY_CONVEX_SITE_PORT", preferred: 3271 },
  { name: "web", variable: "VERIFY_WEB_PORT", preferred: 8192 },
];
const nothingListens = () => false;
const pick = (overrides = {}) => reservePorts({ roles: ROLES, env: {}, dir, record: ownRecord(), listening: nothingListens, ...overrides });

describe("parsePort", () => {
  test("unset is null, a number is a port", () => {
    expect(parsePort("P", undefined)).toBeNull();
    expect(parsePort("P", "")).toBeNull();
    expect(parsePort("P", "3280")).toBe(3280);
  });

  test("refuses what isn't a usable port", () => {
    expect(() => parsePort("P", "abc")).toThrow("isn't a port");
    expect(() => parsePort("P", "80")).toThrow("isn't a port");
    expect(() => parsePort("P", "6000")).toThrow("fetch refuses");
    expect(() => parsePort("P", "8081")).toThrow("Daniel's Metro");
  });
});

describe("reservePorts", () => {
  test("takes the defaults when they are free", () => {
    const { ports } = pick();
    expect(ports).toEqual({ convex: 3270, convexSite: 3271, web: 8192 });
    expect(existsSync(join(dir, "3270.lock"))).toBe(true);
  });

  test("a second run at the same time gets other ports, and the first's come back on release", () => {
    const first = pick();
    const second = pick();
    expect(second.ports).toEqual({ convex: 3272, convexSite: 3273, web: 8193 });
    first.release();
    first.release();
    expect(existsSync(join(dir, "3270.lock"))).toBe(false);
    expect(pick().ports).toEqual({ convex: 3270, convexSite: 3271, web: 8192 });
    second.release();
  });

  test("skips a port another process listens on", () => {
    expect(pick({ listening: (port) => port === 3270 || port === 8192 }).ports).toEqual({ convex: 3271, convexSite: 3272, web: 8193 });
  });

  test("skips ports Node's fetch refuses and Daniel's Metro", () => {
    const { ports } = reservePorts({
      roles: [{ name: "a", variable: "A", preferred: 6000 }, { name: "b", variable: "B", preferred: 8081 }],
      env: {}, dir, record: ownRecord(), listening: nothingListens,
    });
    expect(ports).toEqual({ a: 6001, b: 8082 });
  });

  test("takes over a reservation left by a run that has gone", () => {
    const pid = spawnSync(process.execPath, ["-e", ""]).pid;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "3270.lock"), JSON.stringify({ token: "old", pid, started: "earlier" }));
    expect(pick().ports.convex).toBe(3270);
  });

  test("an env var fixes the port, and fails when another run has it", () => {
    const first = pick();
    expect(() => pick({ env: { VERIFY_WEB_PORT: "8192" } })).toThrow("reserved by another verify run");
    // A failed pick gives back what it had reserved before it failed.
    expect(existsSync(join(dir, "3272.lock"))).toBe(false);
    first.release();
    expect(pick({ env: { VERIFY_WEB_PORT: "8197" } }).ports.web).toBe(8197);
  });

  test("an env var can't reuse another role's port", () => {
    expect(() => pick({ env: { VERIFY_CONVEX_SITE_PORT: "3270" }, roles: [ROLES[0], { ...ROLES[1], preferred: 3270 }] })).toThrow("already this run's convex port");
  });

  test("says which variable to set when nothing in range is free", () => {
    expect(() => pick({ listening: () => true, span: 3 })).toThrow("no free port for convex in 3270-3272; set VERIFY_CONVEX_PORT");
  });
});
