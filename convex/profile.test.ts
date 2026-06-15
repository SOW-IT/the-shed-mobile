/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

/** A signed-in identity whose subject resolves to a real users row. */
const signedIn = (t: TestConvex<typeof schema>, userId: string, email: string) =>
  t.withIdentity({ email, subject: `${userId}|session`, issuer: "test" });

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  return t;
}

describe("profile.get", () => {
  test("null while auth attaches, and hides future (pre-provisioned) years", async () => {
    const t = await setup();
    expect(await t.query(api.profile.get, {})).toBeNull();

    const email = "fran@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR,
        roles: ["Staff"],
        department: "Data and IT",
      });
      // Next year is pre-provisioned but must stay hidden until rollover.
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR + 1,
        roles: ["Staff"],
        department: "Data and IT",
      });
    });
    const profile = (await asUser(t, email).query(api.profile.get, { email }))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR]);
    expect(profile.isMe).toBe(true);
  });

  test("falls back to the directory name when no user row or profile name exists", async () => {
    const t = await setup();
    const email = "nav@sow.org.au";
    await t.run(async (ctx) => {
      // Profile with no name field.
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR,
        roles: ["Staff"],
        department: "Data and IT",
      });
      // No users row — directory entry is the only name source.
      await ctx.db.insert("directoryUsers", { email, name: "Nav from Directory" });
    });
    const profile = (await asUser(t, email).query(api.profile.get, { email }))!;
    expect(profile.name).toBe("Nav from Directory");
  });
});

describe("profile.updateChurch", () => {
  test("sets and clears the church; requires a signed-in user", async () => {
    const t = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "gita@sow.org.au", name: "Gita" })
    );
    const me = signedIn(t, userId, "gita@sow.org.au");

    await me.mutation(api.profile.updateChurch, { localChurch: "SOW City" });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.localChurch))
    ).toBe("SOW City");

    // An empty value clears it (the field is removed, not set to "").
    await me.mutation(api.profile.updateChurch, { localChurch: "   " });
    const cleared = await t.run((ctx) =>
      ctx.db.get("users", userId).then((u) => u !== null && "localChurch" in u)
    );
    expect(cleared).toBe(false);

    // A valid user id whose row has since been deleted -> rejected.
    const ghostId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "ghost@sow.org.au" });
      await ctx.db.delete("users", id);
      return id;
    });
    await expect(
      signedIn(t, ghostId, "ghost@sow.org.au").mutation(api.profile.updateChurch, {
        localChurch: "x",
      })
    ).rejects.toThrow(/signed in/);
  });
});

describe("profile avatars", () => {
  test("generates an upload URL and replaces a previous avatar", async () => {
    const t = await setup();
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "ivy@sow.org.au", name: "Ivy" })
    );
    const me = signedIn(t, userId, "ivy@sow.org.au");

    const url = await me.mutation(api.profile.generateAvatarUploadUrl, {});
    expect(typeof url).toBe("string");

    // First avatar.
    const first = await t.run((ctx) =>
      ctx.storage.store(new Blob(["a"], { type: "image/png" }))
    );
    await me.mutation(api.profile.setAvatar, { storageId: first });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.avatarId))
    ).toBe(first);

    // Replacing deletes the old file and stores the new one (covers the
    // existing-avatar branch).
    const second = await t.run((ctx) =>
      ctx.storage.store(new Blob(["b"], { type: "image/png" }))
    );
    await me.mutation(api.profile.setAvatar, { storageId: second });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.avatarId))
    ).toBe(second);
    // The old file is gone.
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
  });
});
