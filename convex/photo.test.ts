/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { photoFor } from "./photo";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const EMAIL = "brandon@sow.org.au";
const GOOGLE_IMAGE = "https://lh3.googleusercontent.com/a/monogram";

async function seed({
  avatar,
  directoryPhoto,
  googleImage,
}: {
  avatar?: boolean;
  directoryPhoto?: boolean;
  googleImage?: boolean;
}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const avatarId = avatar
      ? await ctx.storage.store(new Blob(["avatar"], { type: "image/png" }))
      : undefined;
    const photoId = directoryPhoto
      ? await ctx.storage.store(new Blob(["directory"], { type: "image/jpeg" }))
      : undefined;
    await ctx.db.insert("users", {
      email: EMAIL,
      ...(googleImage ? { image: GOOGLE_IMAGE } : {}),
      ...(avatarId ? { avatarId } : {}),
    });
    await ctx.db.insert("directoryUsers", {
      email: EMAIL,
      ...(photoId ? { photoId } : {}),
    });
    return {
      avatarUrl: avatarId ? await ctx.storage.getUrl(avatarId) : null,
      directoryUrl: photoId ? await ctx.storage.getUrl(photoId) : null,
    };
  });
  const resolve = (email: string | null = EMAIL) =>
    t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", EMAIL))
        .first();
      return photoFor(ctx, user, email);
    });
  return { t, ids, resolve };
}

describe("photoFor", () => {
  test("an uploaded avatar beats the directory photo and the Google image", async () => {
    const { ids, resolve } = await seed({
      avatar: true,
      directoryPhoto: true,
      googleImage: true,
    });
    expect(await resolve()).toBe(ids.avatarUrl);
  });

  test("the directory photo beats the Google sign-in image", async () => {
    const { ids, resolve } = await seed({ directoryPhoto: true, googleImage: true });
    expect(ids.directoryUrl).toBeTruthy();
    expect(await resolve()).toBe(ids.directoryUrl);
  });

  test("the directory lookup ignores email case", async () => {
    const { ids, resolve } = await seed({ directoryPhoto: true, googleImage: true });
    expect(await resolve(EMAIL.toUpperCase())).toBe(ids.directoryUrl);
  });

  test("falls back to the Google image without a directory photo", async () => {
    const { resolve } = await seed({ googleImage: true });
    expect(await resolve()).toBe(GOOGLE_IMAGE);
    expect(await resolve(null)).toBe(GOOGLE_IMAGE);
  });

  test("falls through a deleted upload to the next source", async () => {
    const { t, resolve } = await seed({ avatar: true, googleImage: true });
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", EMAIL))
        .first();
      await ctx.storage.delete(user!.avatarId!);
    });
    expect(await resolve()).toBe(GOOGLE_IMAGE);
  });

  test("null with no source, so the app draws initials", async () => {
    const { resolve } = await seed({});
    expect(await resolve()).toBeNull();
  });
});
