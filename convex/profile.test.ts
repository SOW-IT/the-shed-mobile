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
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR + 1,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
    });
    const profile = (await asUser(t, email).query(api.profile.get, { email }))!;
    expect(profile.serviceHistory.map((h) => h.year)).toEqual([YEAR]);
    expect(profile.isMe).toBe(true);
  });

  test("public person view (1.7.0): readable signed out with an email, a typed church hidden", async () => {
    const t = await setup();
    const email = "pat@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR,
        name: "Pat Staff",
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      await ctx.db.insert("users", { email, localChurch: "Grace Church" });
    });

    const anon = (await t.query(api.profile.get, { email }))!;
    expect(anon.name).toBe("Pat Staff");
    expect(anon.isMe).toBe(false);
    expect(anon.serviceHistory.map((h) => h.year)).toEqual([YEAR]);
    expect(anon.localChurch).toBeNull();
    const viewer = (await asUser(t, ADMIN).query(api.profile.get, { email }))!;
    expect(viewer.localChurch).toBe("Grace Church");

    expect(await t.query(api.profile.get, {})).toBeNull();

    const grace = await t.run(async (ctx) => {
      const churchId = await ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", addedBy: ADMIN });
      const user = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first())!;
      await ctx.db.patch("users", user._id, { churchId, localChurch: undefined });
      return churchId;
    });
    const listed = (await t.query(api.profile.get, { email }))!;
    expect(listed.church?._id).toBe(grace);
    expect(listed.localChurch).toBeNull();
    expect(listed.typedChurch).toBeNull();
  });

  test("falls back to the directory name when no user row or profile name exists", async () => {
    const t = await setup();
    const email = "nav@sow.org.au";
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", {
        email,
        year: YEAR,
        assignments: [{ role: "Staff", department: "Data and IT" }],
      });
      await ctx.db.insert("directoryUsers", { email, name: "Nav from Directory" });
    });
    const profile = (await asUser(t, email).query(api.profile.get, { email }))!;
    expect(profile.name).toBe("Nav from Directory");
  });

  test("your own profile says when Google last synced it; nobody else's does", async () => {
    const t = await setup();
    const email = "gia@sow.org.au";
    const signInAt = Date.UTC(2026, 9, 1);
    const directoryAt = Date.UTC(2026, 9, 5);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email, name: "Gia", emailVerificationTime: signInAt });
    });
    expect((await asUser(t, email).query(api.profile.get, {}))!.googleSyncedAt).toBe(signInAt);

    await t.run(async (ctx) => {
      await ctx.db.insert("directoryUsers", { email, name: "Gia" });
      await ctx.db.insert("syncState", { key: "directory", at: directoryAt, detail: "synced 40 people" });
    });
    expect((await asUser(t, email).query(api.profile.get, {}))!.googleSyncedAt).toBe(directoryAt);
    expect((await asUser(t, ADMIN).query(api.profile.get, { email }))!.googleSyncedAt).toBeNull();
    expect((await t.query(api.profile.get, { email }))!.googleSyncedAt).toBeNull();

    await t.run(async (ctx) => {
      const state = (await ctx.db.query("syncState").first())!;
      await ctx.db.patch("syncState", state._id, { at: directoryAt + 1, detail: "failed: quota" });
    });
    expect((await asUser(t, email).query(api.profile.get, {}))!.googleSyncedAt).toBe(signInAt);

    await t.run(async (ctx) => {
      const state = (await ctx.db.query("syncState").first())!;
      await ctx.db.patch("syncState", state._id, { lastSuccessAt: directoryAt });
    });
    expect((await asUser(t, email).query(api.profile.get, {}))!.googleSyncedAt).toBe(directoryAt);
    await t.run(async (ctx) => {
      const state = (await ctx.db.query("syncState").first())!;
      await ctx.db.patch("syncState", state._id, { lastSuccessAt: undefined });
    });

    await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first())!;
      await ctx.db.patch("users", user._id, { emailVerificationTime: undefined });
    });
    expect((await asUser(t, email).query(api.profile.get, {}))!.googleSyncedAt).toBeNull();

    const guest = "gia@icloud.com";
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { email: guest, name: "Gia", emailVerificationTime: signInAt });
    });
    expect((await asUser(t, guest).query(api.profile.get, {}))!.googleSyncedAt).toBeNull();
  });
});

describe("profile.get without an email", () => {
  test("your own Profile loads for an Apple account Apple gave no email", async () => {
    const t = await setup();
    const { userId, churchId } = await t.run(async (ctx) => {
      const churchId = await ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", addedBy: ADMIN });
      return { userId: await ctx.db.insert("users", { name: "Apple user", localChurch: "Hillside" }), churchId };
    });
    const me = t.withIdentity({ subject: `${userId}|s`, issuer: "test" });
    expect(await me.query(api.profile.get, {})).toMatchObject({
      email: "",
      isMe: true,
      name: "Apple user",
      localChurch: "Hillside",
      typedChurch: "Hillside",
      church: null,
      serviceHistory: [],
    });

    await t.run(async (ctx) => ctx.db.patch("users", userId, { churchId, localChurch: undefined, name: undefined }));
    const picked = (await me.query(api.profile.get, {}))!;
    expect(picked.church?._id).toBe(churchId);
    expect(picked.localChurch).toBeNull();
    expect(picked.typedChurch).toBeNull();
    expect(picked.name).toBeNull();

    await t.run(async (ctx) => ctx.db.delete("users", userId));
    expect(await me.query(api.profile.get, {})).toBeNull();
  });
});

describe("profile.setChurch", () => {
  test("sets and clears the church; requires a signed-in user", async () => {
    const t = await setup();
    const { userId, churchId } = await t.run(async (ctx) => ({
      userId: await ctx.db.insert("users", { email: "gita@sow.org.au", name: "Gita", localChurch: "SOW City" }),
      churchId: await ctx.db.insert("churches", { name: "Grace Church", nameKey: "grace church", addedBy: ADMIN }),
    }));
    const me = signedIn(t, userId, "gita@sow.org.au");
    const row = () => t.run((ctx) => ctx.db.get("users", userId));

    await me.mutation(api.profile.setChurch, { churchId });
    expect(await row()).toMatchObject({ churchId });
    expect((await row())?.localChurch).toBeUndefined();

    await me.mutation(api.profile.setChurch, { churchId: null });
    const cleared = await row();
    expect(cleared !== null && "churchId" in cleared).toBe(false);

    const ghostId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: "ghost@sow.org.au" });
      await ctx.db.delete("users", id);
      return id;
    });
    await expect(
      signedIn(t, ghostId, "ghost@sow.org.au").mutation(api.profile.setChurch, { churchId: null })
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

    const first = await t.run((ctx) =>
      ctx.storage.store(new Blob(["a"], { type: "image/png" }))
    );
    await me.mutation(api.profile.setAvatar, { storageId: first });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.avatarId))
    ).toBe(first);

    const second = await t.run((ctx) =>
      ctx.storage.store(new Blob(["b"], { type: "image/png" }))
    );
    await me.mutation(api.profile.setAvatar, { storageId: second });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.avatarId))
    ).toBe(second);
    expect(await t.run((ctx) => ctx.storage.getUrl(first))).toBeNull();
  });

  test("replaces an avatar whose old file is already gone", async () => {
    const t = await setup();
    const gone = await t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob(["a"], { type: "image/png" }));
      await ctx.storage.delete(id);
      return id;
    });
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "ivy@sow.org.au", name: "Ivy", avatarId: gone })
    );
    const me = signedIn(t, userId, "ivy@sow.org.au");
    const next = await t.run((ctx) =>
      ctx.storage.store(new Blob(["b"], { type: "image/png" }))
    );
    await me.mutation(api.profile.setAvatar, { storageId: next });
    expect(
      await t.run((ctx) => ctx.db.get("users", userId).then((u) => u?.avatarId))
    ).toBe(next);
  });
});
