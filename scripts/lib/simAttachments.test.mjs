import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clearTestAttachments } from "./simAttachments.mjs";

let data;
beforeEach(() => {
  data = mkdtempSync(join(tmpdir(), "sim-attachments-test-"));
});
afterEach(() => rmSync(data, { recursive: true, force: true }));

// A container whose metadata plist names `identifier` (the fake reader below
// reads it back), with `files` under its tmp/Attachments.
const container = (uuid, identifier, files) => {
  const dir = join(data, "Containers/Data/InternalDaemon", uuid);
  mkdirSync(join(dir, "tmp/Attachments"), { recursive: true });
  writeFileSync(join(dir, ".com.apple.mobile_container_manager.metadata.plist"), identifier);
  for (const file of files) {
    mkdirSync(join(dir, "tmp/Attachments", file), { recursive: true });
    writeFileSync(join(dir, "tmp/Attachments", file, "shot.png"), "png");
  }
  writeFileSync(join(dir, "tmp/keep.txt"), "keep");
  return dir;
};
const readIdentifier = (plist) => readFileSync(plist, "utf8");

describe("clearTestAttachments", () => {
  test("empties testmanagerd's Attachments and nothing else", () => {
    const testmanagerd = container("AAAA", "com.apple.testmanagerd", ["one", "two"]);
    const other = container("BBBB", "com.apple.somethingelse", ["mine"]);
    expect(clearTestAttachments(data, readIdentifier)).toBe(2);
    expect(readdirSync(join(testmanagerd, "tmp/Attachments"))).toEqual([]);
    expect(existsSync(join(testmanagerd, "tmp/keep.txt"))).toBe(true);
    expect(readdirSync(join(other, "tmp/Attachments"))).toEqual(["mine"]);
  });

  test("finds the container by identifier, whatever its UUID", () => {
    container("AAAA", "com.apple.other", ["x"]);
    container("ZZZZ", "com.apple.testmanagerd", ["y"]);
    expect(clearTestAttachments(data, readIdentifier)).toBe(1);
  });

  test("does nothing on a simulator with no such container or folder", () => {
    expect(clearTestAttachments(join(data, "missing"), readIdentifier)).toBe(0);
    mkdirSync(join(data, "Containers/Data/InternalDaemon/CCCC"), { recursive: true });
    expect(clearTestAttachments(data, readIdentifier)).toBe(0);
  });
});
