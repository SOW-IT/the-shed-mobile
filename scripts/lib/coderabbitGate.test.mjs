import { describe, expect, it } from "vitest";
import { assessSize, codeFingerprint, coveringReview, isAppCode, sensitiveReasons } from "./coderabbitGate.mjs";

const file = (filename, changes = 10, extra = {}) => ({ filename, status: "modified", sha: `blob-${filename}`, changes, ...extra });

describe("isAppCode", () => {
  it("counts app, shared and Convex source", () => {
    expect(isAppCode("src/app/index.tsx")).toBe(true);
    expect(isAppCode("shared/calendar.ts")).toBe(true);
    expect(isAppCode("convex/events.ts")).toBe(true);
  });

  it("leaves out tests, generated code, scripts, docs and config", () => {
    for (const path of [
      "convex/events.test.ts",
      "src/components/__tests__/Button.tsx",
      "convex/_generated/api.d.ts",
      "scripts/pr-status.mjs",
      "docs/verification.md",
      "package.json",
      "app.json",
      "convex/tsconfig.json",
      ".github/workflows/ci.yml",
    ]) {
      expect(isAppCode(path), path).toBe(false);
    }
  });
});

describe("sensitiveReasons", () => {
  it("names each sensitive area by path", () => {
    expect(sensitiveReasons(file("convex/schema.ts"))).toEqual(["the Convex schema (convex/schema.ts)"]);
    expect(sensitiveReasons(file("convex/cleanup.ts"))).toEqual(["data deletion or migration (convex/cleanup.ts)"]);
    expect(sensitiveReasons(file("convex/auth.ts"))).toEqual(["auth or permissions (convex/auth.ts)"]);
    expect(sensitiveReasons(file("convex/memberRoles.ts"))).toEqual(["auth or permissions (convex/memberRoles.ts)"]);
    expect(sensitiveReasons(file("convex/eventRequestAccess.ts"))).toEqual(["auth or permissions (convex/eventRequestAccess.ts)"]);
    expect(sensitiveReasons(file("convex/push.ts"))).toEqual(["push or email notifications (convex/push.ts)"]);
    expect(sensitiveReasons(file("convex/emails.ts"))).toEqual(["push or email notifications (convex/emails.ts)"]);
  });

  it("spots a delete in a patch whatever the file is called", () => {
    const patch = "@@ -1,2 +1,3 @@\n const x = 1;\n+    await ctx.db.delete(row._id);\n";
    expect(sensitiveReasons(file("convex/teams.ts", 3, { patch }))).toEqual(["data deletion or migration (convex/teams.ts)"]);
    expect(sensitiveReasons(file("convex/teams.ts", 3, { patch: " await ctx.db.delete(id);\n" }))).toEqual([]);
  });

  it("ignores sensitive-looking tests and tooling", () => {
    expect(sensitiveReasons(file("convex/auth.test.ts"))).toEqual([]);
    expect(sensitiveReasons(file("scripts/backup-storage-files.mjs"))).toEqual([]);
    expect(sensitiveReasons(file("src/components/AccessibilityLabel.tsx"))).toEqual([]);
  });
});

describe("assessSize", () => {
  it("a small or tooling PR is not big", () => {
    const size = assessSize([file("src/app/index.tsx", 120), file("scripts/verify.mjs", 900), file("convex/events.test.ts", 500)]);
    expect(size).toEqual({ big: false, lines: 120, reasons: [], overridden: false });
  });

  it("more than 300 lines of app or Convex code is big", () => {
    const size = assessSize([file("src/app/index.tsx", 200), file("convex/events.ts", 101)]);
    expect(size.big).toBe(true);
    expect(size.reasons).toEqual(["301 changed lines of app or Convex code (over 300)"]);
  });

  it("exactly 300 lines is not big", () => {
    expect(assessSize([file("src/app/index.tsx", 300)]).big).toBe(false);
  });

  it("a pure move counts no lines", () => {
    expect(assessSize([file("src/lib/b.ts", 0, { status: "renamed", previous_filename: "src/lib/a.ts" })]).lines).toBe(0);
  });

  it("falls back to additions plus deletions", () => {
    expect(assessSize([{ filename: "src/a.ts", status: "modified", additions: 250, deletions: 60 }]).big).toBe(true);
  });

  it("a one-line schema change is big", () => {
    expect(assessSize([file("convex/schema.ts", 1)])).toEqual({ big: true, lines: 1, reasons: ["the Convex schema (convex/schema.ts)"], overridden: false });
  });

  it("--big and --not-big override the path rules", () => {
    expect(assessSize([file("scripts/verify.mjs")], true)).toMatchObject({ big: true, reasons: ["--big"], overridden: true });
    expect(assessSize([file("convex/schema.ts")], false)).toMatchObject({ big: false, reasons: ["--not-big", "the Convex schema (convex/schema.ts)"], overridden: true });
  });
});

describe("coveringReview", () => {
  const reviewed = [file("convex/events.ts", 400), file("README.md")];

  it("a review of the head covers it", () => {
    expect(coveringReview({ head: "h", headFiles: reviewed, reviewed: [{ sha: "h", files: null }] })).toEqual({ commit: "h", how: "reviewed head" });
  });

  it("a clean merge of main keeps the review: the PR's app and Convex changes are the same", () => {
    expect(coveringReview({ head: "merge", headFiles: reviewed, reviewed: [{ sha: "r", files: reviewed }] })).toEqual({
      commit: "r",
      how: "same app and Convex changes",
    });
  });

  it("a later change to docs, tests or scripts alone keeps the review", () => {
    const headFiles = [...reviewed.map((f) => (f.filename === "README.md" ? { ...f, sha: "new" } : f)), file("convex/events.test.ts"), file("scripts/x.mjs")];
    expect(coveringReview({ head: "h", headFiles, reviewed: [{ sha: "r", files: reviewed }] })?.commit).toBe("r");
  });

  it("a merge of main that changes one of the PR's files needs a new review", () => {
    const headFiles = [{ ...reviewed[0], sha: "merged-blob" }, reviewed[1]];
    expect(coveringReview({ head: "merge", headFiles, reviewed: [{ sha: "r", files: reviewed }] })).toBeNull();
  });

  it("a new app file needs a new review", () => {
    expect(coveringReview({ head: "h", headFiles: [...reviewed, file("src/app/new.tsx", 5)], reviewed: [{ sha: "r", files: reviewed }] })).toBeNull();
  });

  it("an older review can cover the head when a later one doesn't", () => {
    const changed = [{ ...reviewed[0], sha: "other" }];
    const result = coveringReview({
      head: "h",
      headFiles: reviewed,
      reviewed: [
        { sha: "newer", files: changed },
        { sha: "gone", files: null },
        { sha: "older", files: reviewed },
      ],
    });
    expect(result).toEqual({ commit: "older", how: "same app and Convex changes" });
  });

  it("no reviews means not covered", () => {
    expect(coveringReview({ head: "h", headFiles: reviewed, reviewed: [] })).toBeNull();
  });
});

describe("codeFingerprint", () => {
  it("ignores file order and non-code files", () => {
    const a = [file("src/a.ts"), file("convex/b.ts"), file("docs/x.md")];
    const b = [file("convex/b.ts"), file("src/a.ts")];
    expect(codeFingerprint(a)).toBe(codeFingerprint(b));
  });

  it("compares every file when there is no app or Convex code", () => {
    expect(codeFingerprint([file("scripts/a.mjs")])).not.toBe(codeFingerprint([{ ...file("scripts/a.mjs"), sha: "changed" }]));
  });

  it("tracks a file moved out of app code", () => {
    expect(codeFingerprint([file("docs/a.ts", 0, { status: "renamed", previous_filename: "src/a.ts" })])).toContain("src/a.ts -> docs/a.ts");
  });
});
