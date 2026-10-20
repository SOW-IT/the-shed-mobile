import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import {
  backupStorageFiles,
  emptyManifest,
  fileObject,
  knownShas,
  manifestObject,
  parseConvexRunOutput,
  parseManifest,
  sha256Hex,
  summaryLine,
} from "./backupStorageFiles.mjs";

const digest = (body) => createHash("sha256").update(body).digest();
const hex = (body) => digest(body).toString("hex");
const base64 = (body) => digest(body).toString("base64");

const convexFile = (storageId, body, contentType = "application/pdf") => ({
  storageId,
  sha256: base64(body),
  size: Buffer.byteLength(body),
  contentType,
  url: `https://deployment.convex.cloud/api/storage/${storageId}`,
});

const fakeGcs = (bodies) => {
  const objects = new Map();
  const downloads = [];
  return {
    objects,
    downloads,
    download: async (url, storageId) => {
      downloads.push(storageId);
      const body = bodies[storageId];
      if (body === undefined) throw new Error("HTTP 404 fetching the file from Convex");
      return { sha256: hex(body), size: Buffer.byteLength(body), path: `/tmp/${storageId}` };
    },
    upload: async (path, object, metadata) => {
      objects.set(object, { path, ...metadata });
    },
  };
};

const singlePage = (files) => async (cursor) => {
  expect(cursor).toBeNull();
  return { files, continueCursor: "end", isDone: true };
};

describe("sha256Hex", () => {
  test("turns Convex's base64 digest into lower-case hex and accepts hex as is", () => {
    expect(sha256Hex(base64("receipt"))).toBe(hex("receipt"));
    expect(sha256Hex(hex("receipt").toUpperCase())).toBe(hex("receipt"));
  });

  test("rejects anything that is not a 32 byte digest", () => {
    expect(() => sha256Hex("bm90IGEgZGlnZXN0")).toThrow(/Not a SHA-256 digest/);
    expect(() => sha256Hex("!!!!")).toThrow(/Not a SHA-256 digest/);
  });
});

describe("manifest helpers", () => {
  test("paths live under the prefix", () => {
    expect(manifestObject("storage")).toBe("storage/manifest.json");
    expect(fileObject("storage", "abc")).toBe("storage/files/abc");
  });

  test("parseManifest fills in missing maps and rejects other versions", () => {
    expect(parseManifest('{"version":1}')).toEqual({
      version: 1,
      updatedAt: null,
      files: {},
      deleted: {},
    });
    expect(() => parseManifest('{"version":2}')).toThrow(/expected version 1, got 2/);
    expect(() => parseManifest("null")).toThrow(/got undefined/);
  });

  test("knownShas covers live and deleted entries", () => {
    const manifest = {
      ...emptyManifest(),
      files: { a: { sha256: "1" } },
      deleted: { b: { sha256: "2" } },
    };
    expect([...knownShas(manifest)].sort()).toEqual(["1", "2"]);
  });

  test("parseConvexRunOutput skips CLI chatter before the JSON", () => {
    expect(parseConvexRunOutput('Running on prod\n{"files":[],"isDone":true}\n')).toEqual({
      files: [],
      isDone: true,
    });
    expect(() => parseConvexRunOutput("nothing here")).toThrow(/printed no JSON result/);
  });

  test("summaryLine is one line", () => {
    const line = summaryLine({ total: 5, new: 2, skipped: 3, missing: 1, deleted: 4, failed: 0 });
    expect(line).toBe(
      "Storage backup: 5 file(s) in Convex, 2 new, 3 already in GCS, 1 newly missing from Convex (4 kept in GCS after deletion), 0 failed"
    );
    expect(line).not.toContain("\n");
  });
});

describe("backupStorageFiles", () => {
  test("first run copies every file once and records it", async () => {
    const gcs = fakeGcs({ r1: "receipt one", a1: "avatar" });
    const files = [convexFile("r1", "receipt one"), convexFile("a1", "avatar", null)];
    const { manifest, summary } = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage(files),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-20",
    });
    expect(summary).toEqual({ total: 2, new: 2, skipped: 0, missing: 0, deleted: 0, failed: 0 });
    expect(gcs.downloads).toEqual(["r1", "a1"]);
    expect(gcs.objects.get(`storage/files/${hex("receipt one")}`)).toMatchObject({
      contentType: "application/pdf",
      storageId: "r1",
    });
    expect(gcs.objects.get(`storage/files/${hex("avatar")}`)).toMatchObject({
      contentType: "application/octet-stream",
      storageId: "a1",
    });
    expect(manifest).toEqual({
      version: 1,
      updatedAt: "2026-10-20",
      deleted: {},
      files: {
        r1: {
          storageId: "r1",
          sha256: hex("receipt one"),
          size: 11,
          contentType: "application/pdf",
          firstSeen: "2026-10-20",
          lastSeen: "2026-10-20",
          object: `storage/files/${hex("receipt one")}`,
        },
        a1: {
          storageId: "a1",
          sha256: hex("avatar"),
          size: 6,
          contentType: null,
          firstSeen: "2026-10-20",
          lastSeen: "2026-10-20",
          object: `storage/files/${hex("avatar")}`,
        },
      },
    });
  });

  test("the next night downloads nothing that is already in the bucket", async () => {
    const gcs = fakeGcs({ r1: "receipt one", r2: "receipt two" });
    const first = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage([convexFile("r1", "receipt one")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-20",
    });
    const second = await backupStorageFiles({
      manifest: first.manifest,
      listPage: singlePage([convexFile("r1", "receipt one"), convexFile("r2", "receipt two")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-21",
    });
    expect(gcs.downloads).toEqual(["r1", "r2"]);
    expect(second.summary).toMatchObject({ total: 2, new: 1, skipped: 1, missing: 0 });
    expect(second.manifest.files.r1).toMatchObject({ firstSeen: "2026-10-20", lastSeen: "2026-10-21" });
    expect(second.manifest.files.r2).toMatchObject({ firstSeen: "2026-10-21", lastSeen: "2026-10-21" });
  });

  test("a second storage id with the same bytes is recorded without another download", async () => {
    const gcs = fakeGcs({ r1: "same bytes", r2: "same bytes" });
    const { manifest, summary } = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage([convexFile("r1", "same bytes"), convexFile("r2", "same bytes")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-20",
    });
    expect(gcs.downloads).toEqual(["r1"]);
    expect(summary).toMatchObject({ total: 2, new: 1, skipped: 1 });
    expect(manifest.files.r2.object).toBe(manifest.files.r1.object);
    expect(gcs.objects.size).toBe(1);
  });

  test("files gone from Convex move to deleted with their last seen date and stay in GCS", async () => {
    const gcs = fakeGcs({ old: "purged receipt", kept: "kept receipt" });
    const first = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage([convexFile("old", "purged receipt"), convexFile("kept", "kept receipt")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-09-29",
    });
    const second = await backupStorageFiles({
      manifest: first.manifest,
      listPage: singlePage([convexFile("kept", "kept receipt")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-01",
    });
    expect(second.summary).toMatchObject({ total: 1, skipped: 1, missing: 1, deleted: 1 });
    expect(second.manifest.files.old).toBeUndefined();
    expect(second.manifest.deleted.old).toMatchObject({
      sha256: hex("purged receipt"),
      firstSeen: "2026-09-29",
      lastSeen: "2026-09-29",
      object: `storage/files/${hex("purged receipt")}`,
    });
    expect(gcs.objects.has(`storage/files/${hex("purged receipt")}`)).toBe(true);

    const third = await backupStorageFiles({
      manifest: second.manifest,
      listPage: singlePage([convexFile("kept", "kept receipt"), convexFile("again", "purged receipt")]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-02",
    });
    expect(third.summary).toMatchObject({ new: 0, skipped: 2, missing: 0, deleted: 1 });
    expect(gcs.downloads).toEqual(["old", "kept"]);
  });

  test("a manifest written by an older run without lastSeen falls back to its updatedAt", async () => {
    const gcs = fakeGcs({});
    const manifest = {
      ...emptyManifest(),
      updatedAt: "2026-09-30",
      files: { old: { storageId: "old", sha256: hex("x"), size: 1, contentType: null, firstSeen: "2026-09-01", object: "storage/files/x" } },
    };
    const { manifest: next } = await backupStorageFiles({
      manifest,
      listPage: singlePage([]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-01",
    });
    expect(next.deleted.old.lastSeen).toBe("2026-09-30");
    const noDate = await backupStorageFiles({
      manifest: { ...manifest, updatedAt: null },
      listPage: singlePage([]),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-01",
    });
    expect(noDate.manifest.deleted.old.lastSeen).toBe("2026-10-01");
  });

  test("walks every page using the cursor", async () => {
    const gcs = fakeGcs({ a: "a", b: "b", c: "c" });
    const pages = {
      null: { files: [convexFile("a", "a"), convexFile("b", "b")], continueCursor: "p2", isDone: false },
      p2: { files: [convexFile("c", "c")], continueCursor: "end", isDone: true },
    };
    const cursors = [];
    const { summary } = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: async (cursor) => {
        cursors.push(cursor);
        return pages[String(cursor)];
      },
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-20",
    });
    expect(cursors).toEqual([null, "p2"]);
    expect(summary).toMatchObject({ total: 3, new: 3 });
  });

  test("a failed download, a hash mismatch, a missing url and a bad digest are counted, warned and retried next run", async () => {
    const gcs = fakeGcs({ ok: "fine", tampered: "other bytes" });
    const warnings = [];
    const files = [
      convexFile("ok", "fine"),
      convexFile("gone", "never downloads"),
      convexFile("tampered", "expected bytes"),
      { ...convexFile("nourl", "no url"), url: null },
      { ...convexFile("badsha", "bad"), sha256: "not-base64!" },
    ];
    const { manifest, summary } = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage(files),
      download: gcs.download,
      upload: gcs.upload,
      today: "2026-10-20",
      warn: (message) => warnings.push(message),
    });
    expect(summary).toEqual({ total: 5, new: 1, skipped: 0, missing: 0, deleted: 0, failed: 4 });
    expect(Object.keys(manifest.files)).toEqual(["ok"]);
    expect(manifest.deleted).toEqual({});
    expect(warnings).toEqual([
      "Could not back up gone: HTTP 404 fetching the file from Convex",
      expect.stringMatching(
        /^Could not back up tampered: downloaded 11 byte\(s\) hashing [0-9a-f]{64}, Convex recorded [0-9a-f]{64}$/
      ),
      "Skipping nourl: Convex returned no download url",
      "Skipping badsha: Not a SHA-256 digest: not-base64!",
    ]);
    expect(gcs.objects.size).toBe(1);
  });

  test("an upload failure keeps the file out of the manifest so it is retried", async () => {
    const gcs = fakeGcs({ r1: "receipt" });
    const warnings = [];
    const { manifest, summary } = await backupStorageFiles({
      manifest: emptyManifest(),
      listPage: singlePage([convexFile("r1", "receipt")]),
      download: gcs.download,
      upload: async () => {
        throw new Error("gcloud storage cp failed: 403");
      },
      today: "2026-10-20",
      warn: (message) => warnings.push(message),
    });
    expect(summary).toMatchObject({ new: 0, failed: 1 });
    expect(manifest.files).toEqual({});
    expect(warnings).toEqual(["Could not back up r1: gcloud storage cp failed: 403"]);
  });
});
