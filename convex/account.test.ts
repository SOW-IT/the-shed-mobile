/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { exportPKCS8, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { sameName, WIPE_BATCH } from "./account";
import schema from "./schema";
import { linkUserProfiles } from "./userLink";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const STAFF = "sam@sow.org.au";
const GUEST = "guest@privaterelay.appleid.com";
const APPLE_SUB = "001234.apple-sub";
const BUNDLE = "au.org.sow.theshed";

type T = TestConvex<typeof schema>;

const as = (t: T, userId: Id<"users">, sessionId: Id<"authSessions">) =>
  t.withIdentity({ subject: `${userId}|${sessionId}`, issuer: "test" });

async function seedAccount(
  t: T,
  { email, name, provider, providerAccountId }: {
    email: string;
    name?: string;
    provider: string;
    providerAccountId: string;
  }
) {
  return await t.run(async (ctx) => {
    const avatarId = await ctx.storage.store(new Blob(["photo"]));
    const userId = await ctx.db.insert("users", { email, name, avatarId });
    const accountId = await ctx.db.insert("authAccounts", { userId, provider, providerAccountId });
    await ctx.db.insert("authVerificationCodes", {
      accountId,
      provider,
      code: "123456",
      expirationTime: Date.now() + 60_000,
    });
    const sessionId = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 86_400_000,
    });
    const other = await ctx.db.insert("authSessions", {
      userId,
      expirationTime: Date.now() + 86_400_000,
    });
    for (const session of [sessionId, other]) {
      await ctx.db.insert("authRefreshTokens", {
        sessionId: session,
        expirationTime: Date.now() + 86_400_000,
      });
    }
    await ctx.db.insert("pushTokens", { email, token: `ExponentPushToken[${email}]` });
    await ctx.db.insert("lastSeen", { email, at: Date.now() });
    await ctx.db.insert("appInstalls", { email, platform: "ios", version: "2.7.0", seenAt: Date.now() });
    await ctx.db.insert("notifications", { userEmail: email, title: "Hi", body: "Hello", read: false });
    return { userId, sessionId, avatarId };
  });
}

const counts = async (t: T, email: string) =>
  await t.run(async (ctx) => ({
    users: (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).take(10)).length,
    accounts: (await ctx.db.query("authAccounts").take(100)).length,
    codes: (await ctx.db.query("authVerificationCodes").take(100)).length,
    sessions: (await ctx.db.query("authSessions").take(100)).length,
    refreshTokens: (await ctx.db.query("authRefreshTokens").take(2000)).length,
    pushTokens: (await ctx.db.query("pushTokens").withIndex("by_email", (q) => q.eq("email", email)).take(10)).length,
    lastSeen: (await ctx.db.query("lastSeen").withIndex("by_email", (q) => q.eq("email", email)).take(10)).length,
    appInstalls: (
      await ctx.db
        .query("appInstalls")
        .withIndex("by_email_and_platform", (q) => q.eq("email", email))
        .take(10)
    ).length,
    notifications: (
      await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userEmail", email)).take(10)
    ).length,
  }));

let appleKeyPem = "";

beforeEach(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  appleKeyPem = await exportPKCS8(privateKey);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const withAppleKey = () => {
  vi.stubEnv("APPLE_TEAM_ID", "4FH642K7X2");
  vi.stubEnv("APPLE_KEY_ID", "KEY123");
  vi.stubEnv("APPLE_PRIVATE_KEY", appleKeyPem.replace(/\n/g, "\\n"));
};

const idToken = async (sub: string) => {
  const { privateKey } = await generateKeyPair("ES256");
  return await new SignJWT({}).setProtectedHeader({ alg: "ES256" }).setSubject(sub).sign(privateKey);
};

const response = (ok: boolean, body: unknown = {}) =>
  Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });

const appleFetch = (token: unknown, revokeOk = true, tokenOk = true) => {
  const fetchMock = vi.fn((url: string) =>
    url.endsWith("/auth/token") ? response(tokenOk, token) : response(revokeOk)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const formOf = (call: unknown[]) =>
  new URLSearchParams((call[1] as { body: string }).body);

describe("sameName", () => {
  test("ignores case and extra spaces, never matches empty", () => {
    expect(sameName("  sam   smith ", "Sam Smith")).toBe(true);
    expect(sameName("Sam", "Sam Smith")).toBe(false);
    expect(sameName("  ", "")).toBe(false);
  });
});

describe("account.get", () => {
  test("null signed out or with a missing user; kind and name otherwise", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.account.get, {})).toBeNull();

    const staff = await seedAccount(t, { email: STAFF, name: " Sam Smith ", provider: "google", providerAccountId: "g-1" });
    expect(await as(t, staff.userId, staff.sessionId).query(api.account.get, {})).toEqual({
      name: "Sam Smith",
      kind: "sow",
    });

    const guest = await seedAccount(t, { email: GUEST, provider: "apple", providerAccountId: APPLE_SUB });
    expect(await as(t, guest.userId, guest.sessionId).query(api.account.get, {})).toEqual({
      name: GUEST,
      kind: "apple",
    });

    const nameless = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {});
      return { userId, sessionId: await ctx.db.insert("authSessions", { userId, expirationTime: 0 }) };
    });
    expect(await as(t, nameless.userId, nameless.sessionId).query(api.account.get, {})).toEqual({
      name: "DELETE",
      kind: "sow",
    });

    await t.run(async (ctx) => ctx.db.delete("users", staff.userId));
    expect(await as(t, staff.userId, staff.sessionId).query(api.account.get, {})).toBeNull();
  });
});

describe("account.deleteMine", () => {
  test("refuses signed out and a name that doesn't match", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.account.deleteMine, { confirmName: "x" })).rejects.toThrow(
      "You must be signed in."
    );
    const staff = await seedAccount(t, { email: STAFF, name: "Sam Smith", provider: "google", providerAccountId: "g-1" });
    await expect(
      as(t, staff.userId, staff.sessionId).action(api.account.deleteMine, { confirmName: "Sam" })
    ).rejects.toThrow("That name doesn't match");
    expect((await counts(t, STAFF)).users).toBe(1);
  });

  test("a SOW account loses its login and sessions but keeps its staff profile and Google sync data", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const staff = await seedAccount(t, { email: STAFF, name: "Sam Smith", provider: "google", providerAccountId: "g-1" });
    await t.run(async (ctx) => {
      await ctx.db.insert("staffProfiles", { email: STAFF, year: YEAR, name: "Sam Smith", userId: staff.userId, importId: "p-1" });
      await ctx.db.insert("directoryUsers", { email: STAFF, name: "Sam Smith" });
    });

    await as(t, staff.userId, staff.sessionId).action(api.account.deleteMine, { confirmName: "sam smith" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await counts(t, STAFF)).toEqual({
      users: 0,
      accounts: 0,
      codes: 0,
      sessions: 0,
      refreshTokens: 0,
      pushTokens: 0,
      lastSeen: 0,
      appInstalls: 0,
      notifications: 1,
    });
    await t.run(async (ctx) => {
      const [profile] = await ctx.db.query("staffProfiles").take(10);
      expect(profile).toMatchObject({ email: STAFF, name: "Sam Smith", importId: "p-1" });
      expect(profile.userId).toBeUndefined();
      expect(await ctx.db.query("directoryUsers").take(10)).toHaveLength(1);
      expect(await ctx.db.system.get(staff.avatarId)).toBeNull();
    });

    const again = await t.run(async (ctx) => ctx.db.insert("users", { email: STAFF, name: "Sam Smith" }));
    await t.run((ctx) => linkUserProfiles(ctx, again));
    await t.run(async (ctx) => {
      const [profile] = await ctx.db.query("staffProfiles").take(10);
      expect(profile.userId).toBe(again);
    });
  });

  test("an Apple guest is removed entirely, revoking Apple's tokens", async () => {
    vi.useFakeTimers();
    withAppleKey();
    const fetchMock = appleFetch({ id_token: await idToken(APPLE_SUB), refresh_token: "rt-1", access_token: "at-1" });
    const t = convexTest(schema, modules);
    const guest = await seedAccount(t, { email: GUEST, name: "Gina Guest", provider: "apple", providerAccountId: APPLE_SUB });

    await as(t, guest.userId, guest.sessionId).action(api.account.deleteMine, {
      confirmName: "Gina Guest",
      apple: { authorizationCode: "code-1", clientId: BUNDLE },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(Object.values(await counts(t, GUEST)).every((n) => n === 0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const exchange = formOf(fetchMock.mock.calls[0]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://appleid.apple.com/auth/token");
    expect(exchange.get("code")).toBe("code-1");
    expect(exchange.get("client_id")).toBe(BUNDLE);
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("client_secret")?.split(".")).toHaveLength(3);
    const revoke = formOf(fetchMock.mock.calls[1]);
    expect(fetchMock.mock.calls[1][0]).toBe("https://appleid.apple.com/auth/revoke");
    expect(revoke.get("token")).toBe("rt-1");
    expect(revoke.get("token_type_hint")).toBe("refresh_token");
  });

  test("revokes the access token when Apple returns no refresh token", async () => {
    withAppleKey();
    const fetchMock = appleFetch({ id_token: await idToken(APPLE_SUB), access_token: "at-1" });
    const t = convexTest(schema, modules);
    const guest = await seedAccount(t, { email: GUEST, name: "Gina Guest", provider: "apple", providerAccountId: APPLE_SUB });
    await as(t, guest.userId, guest.sessionId).action(api.account.deleteMine, {
      confirmName: "Gina Guest",
      apple: { authorizationCode: "code-1", clientId: BUNDLE },
    });
    const revoke = formOf(fetchMock.mock.calls[1]);
    expect(revoke.get("token")).toBe("at-1");
    expect(revoke.get("token_type_hint")).toBe("access_token");

    const bare = await seedAccount(t, { email: "bare@icloud.com", name: "Bare", provider: "apple", providerAccountId: APPLE_SUB });
    appleFetch({ id_token: await idToken(APPLE_SUB) });
    await as(t, bare.userId, bare.sessionId).action(api.account.deleteMine, {
      confirmName: "Bare",
      apple: { authorizationCode: "code-2", clientId: BUNDLE },
    });
    expect((await counts(t, "bare@icloud.com")).users).toBe(0);
  });

  test("still deletes when Apple can't be reached or no key is set", async () => {
    const t = convexTest(schema, modules);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const noKey = await seedAccount(t, { email: "a@icloud.com", name: "A", provider: "apple", providerAccountId: "s-a" });
    const fetchMock = appleFetch({});
    await as(t, noKey.userId, noKey.sessionId).action(api.account.deleteMine, {
      confirmName: "A",
      apple: { authorizationCode: "c", clientId: BUNDLE },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await counts(t, "a@icloud.com")).users).toBe(0);

    withAppleKey();
    const exchangeFails = await seedAccount(t, { email: "b@icloud.com", name: "B", provider: "apple", providerAccountId: "s-b" });
    appleFetch({ error: "invalid_grant" }, true, false);
    await as(t, exchangeFails.userId, exchangeFails.sessionId).action(api.account.deleteMine, {
      confirmName: "B",
      apple: { authorizationCode: "c", clientId: BUNDLE },
    });
    expect((await counts(t, "b@icloud.com")).users).toBe(0);

    const revokeFails = await seedAccount(t, { email: "c@icloud.com", name: "C", provider: "apple", providerAccountId: "s-c" });
    appleFetch({ id_token: await idToken("s-c"), refresh_token: "rt" }, false);
    await as(t, revokeFails.userId, revokeFails.sessionId).action(api.account.deleteMine, {
      confirmName: "C",
      apple: { authorizationCode: "c", clientId: BUNDLE },
    });
    expect((await counts(t, "c@icloud.com")).users).toBe(0);

    const noCode = await seedAccount(t, { email: "d@icloud.com", name: "D", provider: "apple", providerAccountId: "s-d" });
    const untouched = appleFetch({});
    await as(t, noCode.userId, noCode.sessionId).action(api.account.deleteMine, { confirmName: "D" });
    expect(untouched).not.toHaveBeenCalled();
    expect((await counts(t, "d@icloud.com")).users).toBe(0);
  });

  test("keeps the account when the Apple ID or app doesn't match", async () => {
    withAppleKey();
    const t = convexTest(schema, modules);
    const guest = await seedAccount(t, { email: GUEST, name: "Gina Guest", provider: "apple", providerAccountId: APPLE_SUB });

    appleFetch({ id_token: await idToken("someone-else"), refresh_token: "rt" });
    await expect(
      as(t, guest.userId, guest.sessionId).action(api.account.deleteMine, {
        confirmName: "Gina Guest",
        apple: { authorizationCode: "c", clientId: BUNDLE },
      })
    ).rejects.toThrow("Sign in with the same Apple ID");

    appleFetch({ refresh_token: "rt" });
    await expect(
      as(t, guest.userId, guest.sessionId).action(api.account.deleteMine, {
        confirmName: "Gina Guest",
        apple: { authorizationCode: "c", clientId: BUNDLE },
      })
    ).rejects.toThrow("Sign in with the same Apple ID");

    await expect(
      as(t, guest.userId, guest.sessionId).action(api.account.deleteMine, {
        confirmName: "Gina Guest",
        apple: { authorizationCode: "c", clientId: "com.example.other" },
      })
    ).rejects.toThrow("That isn't The SHED's Apple sign-in.");
    expect((await counts(t, GUEST)).users).toBe(1);
  });
});

describe("account.fillFromApple", () => {
  test("fills a missing email and the fallback name, never overwrites, skips an email someone else has", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      bare: await ctx.db.insert("users", { name: "Apple user" }),
      named: await ctx.db.insert("users", { name: "Gina Guest", email: "gina@icloud.com" }),
      unnamed: await ctx.db.insert("users", {}),
      taken: await ctx.db.insert("users", { email: "taken@gmail.com" }),
      gone: await ctx.db.insert("users", {}),
    }));
    await t.run(async (ctx) => ctx.db.delete("users", ids.gone));
    const fill = (userId: Id<"users">, email: string | null, name: string | null) =>
      t.mutation(internal.account.fillFromApple, { userId, email, name });

    await fill(ids.bare, "abc@privaterelay.appleid.com", "Chan Kim");
    await fill(ids.named, "other@icloud.com", "Someone Else");
    await fill(ids.unnamed, "taken@gmail.com", "New Name");
    await fill(ids.unnamed, null, null);
    expect(await fill(ids.gone, "x@icloud.com", "X")).toBeNull();

    await t.run(async (ctx) => {
      expect(await ctx.db.get("users", ids.bare)).toMatchObject({ email: "abc@privaterelay.appleid.com", name: "Chan Kim" });
      expect(await ctx.db.get("users", ids.named)).toMatchObject({ email: "gina@icloud.com", name: "Gina Guest" });
      const unnamed = await ctx.db.get("users", ids.unnamed);
      expect(unnamed?.email).toBeUndefined();
      expect(unnamed?.name).toBe("New Name");
    });
  });
});

describe("account.wipe", () => {
  test("a user already gone, no email, or an avatar file already deleted", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const avatarId = await ctx.storage.store(new Blob(["x"]));
      const gone = await ctx.db.insert("users", {});
      await ctx.db.delete("users", gone);
      const bare = await ctx.db.insert("users", { avatarId });
      await ctx.storage.delete(avatarId);
      return { gone, bare };
    });
    expect(await t.mutation(internal.account.wipe, { userId: ids.gone })).toBeNull();
    await t.mutation(internal.account.wipe, { userId: ids.bare });
    await t.run(async (ctx) => {
      expect(await ctx.db.get("users", ids.bare)).toBeNull();
    });
  });

  test("keeps going until every session and email-keyed row is gone, then deletes the user", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const over = WIPE_BATCH + 1;
    const userId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: GUEST, name: "Gina Guest" });
      await ctx.db.insert("authAccounts", { userId, provider: "apple", providerAccountId: APPLE_SUB });
      for (let i = 0; i < over; i++) {
        await ctx.db.insert("authSessions", { userId, expirationTime: 0 });
        await ctx.db.insert("pushTokens", { email: GUEST, token: `t${i}` });
        await ctx.db.insert("lastSeen", { email: GUEST, at: i });
        await ctx.db.insert("appInstalls", { email: GUEST, platform: "ios", version: "2.7.0", seenAt: i });
        await ctx.db.insert("notifications", { userEmail: GUEST, title: "Hi", body: `${i}`, read: false });
      }
      return userId;
    });
    await t.mutation(internal.account.wipe, { userId });
    expect((await counts(t, GUEST)).users).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(Object.values(await counts(t, GUEST)).every((n) => n === 0)).toBe(true);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("authSessions").take(10)).toHaveLength(0);
      expect(await ctx.db.query("lastSeen").take(10)).toHaveLength(0);
    });
  });

  test("clears long-lived sessions' refresh tokens in batches", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const { userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: STAFF });
      for (const size of [700, 500, 3]) {
        const sessionId = await ctx.db.insert("authSessions", { userId, expirationTime: 0 });
        for (let i = 0; i < size; i++) {
          await ctx.db.insert("authRefreshTokens", { sessionId, expirationTime: 0 });
        }
      }
      return { userId };
    });
    await t.mutation(internal.account.wipe, { userId });
    expect((await counts(t, STAFF)).refreshTokens).toBe(1203);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await counts(t, STAFF)).refreshTokens).toBe(0);
  });
});
