import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_PAGE_SIZE } from "./storageBackup";

const modules = import.meta.glob("./**/*.ts");

const store = (t: ReturnType<typeof convexTest>, body: string, type?: string) =>
  t.run((ctx) => ctx.storage.store(new Blob([body], type ? { type } : undefined)));

describe("storageBackup.listFiles", () => {
  test("returns every file's metadata and a download url, in pages", async () => {
    const t = convexTest(schema, modules);
    const receipt = await store(t, "receipt", "application/pdf");
    const avatar = await store(t, "avatar", "image/jpeg");
    const untyped = await store(t, "plain");

    const first = await t.query(internal.storageBackup.listFiles, { numItems: 2 });
    expect(first.isDone).toBe(false);
    expect(first.files).toHaveLength(2);

    const second = await t.query(internal.storageBackup.listFiles, {
      cursor: first.continueCursor,
      numItems: 2,
    });
    expect(second.isDone).toBe(true);
    expect(second.files).toHaveLength(1);

    const all = [...first.files, ...second.files];
    expect(all.map((f) => f.storageId).sort()).toEqual([receipt, avatar, untyped].sort());
    for (const file of all) {
      expect(file.sha256).toMatch(/^[A-Za-z0-9+/=]{44}$/);
      expect(file.size).toBeGreaterThan(0);
      expect(file.url).toEqual(await t.run((ctx) => ctx.storage.getUrl(file.storageId)));
    }
    expect(all.find((f) => f.storageId === receipt)).toMatchObject({ size: 7, contentType: "application/pdf" });
    expect(all.find((f) => f.storageId === avatar)?.size).toBe(6);
    expect(all.find((f) => f.storageId === untyped)?.contentType).toBeNull();
  });

  test("defaults the page size and clamps a bad one", async () => {
    const t = convexTest(schema, modules);
    await store(t, "one");
    await store(t, "two");
    const defaulted = await t.query(internal.storageBackup.listFiles, {});
    expect(defaulted.isDone).toBe(true);
    expect(defaulted.files).toHaveLength(2);
    expect(DEFAULT_PAGE_SIZE).toBe(100);

    const clamped = await t.query(internal.storageBackup.listFiles, { numItems: 0 });
    expect(clamped.files).toHaveLength(1);
    expect(clamped.isDone).toBe(false);

    const capped = await t.query(internal.storageBackup.listFiles, {
      numItems: 10_000,
      cursor: null,
    });
    expect(capped.files).toHaveLength(2);
  });

  test("an empty deployment is one finished empty page", async () => {
    const t = convexTest(schema, modules);
    const page = await t.query(internal.storageBackup.listFiles, {});
    expect(page).toMatchObject({ files: [], isDone: true });
  });
});
