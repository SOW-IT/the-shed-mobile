import { describe, expect, test } from "vitest";
import { makeRunner, TRANSIENT_FAILURE } from "./loadConvexSnapshot.mjs";

const TOKEN_TIMEOUT =
  "BigQuery error in load operation: Error retrieving auth credentials from gcloud:\n" +
  "ERROR: (gcloud.auth.print-access-token) There was a problem refreshing your\n" +
  "current auth tokens: ('Unable to retrieve Identity Pool subject token', 'upstream request timeout')";

const scripted = (results) => {
  const calls = [];
  const spawn = (command, args) => {
    calls.push([command, ...args]);
    return results.shift();
  };
  return { spawn, calls };
};
const quiet = { sleep: () => {}, warn: () => {} };

describe("makeRunner", () => {
  test("retries the credential timeout that failed the 25 Sep load, then succeeds", () => {
    const { spawn, calls } = scripted([
      { status: 1, stdout: "", stderr: TOKEN_TIMEOUT },
      { status: 0, stdout: "ok", stderr: "" },
    ]);
    const slept = [];
    const run = makeRunner(spawn, { ...quiet, sleep: (ms) => slept.push(ms), backoffMs: 10 });
    expect(run("bq", ["--quiet", "load", "x"]).stdout).toBe("ok");
    expect(calls).toHaveLength(2);
    expect(slept).toEqual([10]);
  });

  test("gives up after the last attempt with the real output", () => {
    const { spawn, calls } = scripted([
      { status: 1, stderr: TOKEN_TIMEOUT },
      { status: 1, stderr: TOKEN_TIMEOUT },
      { status: 1, stderr: TOKEN_TIMEOUT },
    ]);
    const run = makeRunner(spawn, quiet);
    expect(() => run("bq", ["load"])).toThrow(/upstream request timeout/);
    expect(calls).toHaveLength(3);
  });

  test("does not retry a real error", () => {
    const { spawn, calls } = scripted([{ status: 1, stderr: "Access Denied: Dataset theshedsow:x" }]);
    const run = makeRunner(spawn, quiet);
    expect(() => run("bq", ["load"])).toThrow(/Access Denied/);
    expect(calls).toHaveLength(1);
  });

  test("allowFailure still returns a non-transient failure without throwing", () => {
    const { spawn } = scripted([{ status: 2, stderr: "Not found: Dataset theshedsow:x" }]);
    const run = makeRunner(spawn, quiet);
    expect(run("bq", ["ls"], { allowFailure: true }).status).toBe(2);
  });

  test("a spawn error is thrown as is", () => {
    const run = makeRunner(() => ({ error: new Error("ENOENT bq") }), quiet);
    expect(() => run("bq", [])).toThrow("ENOENT bq");
  });

  test("recognises the usual transient messages", () => {
    for (const text of ["upstream request timeout", "Connection reset by peer", "backendError", "HTTP 503"]) {
      expect(TRANSIENT_FAILURE.test(text)).toBe(true);
    }
    expect(TRANSIENT_FAILURE.test("Access Denied")).toBe(false);
  });
});
