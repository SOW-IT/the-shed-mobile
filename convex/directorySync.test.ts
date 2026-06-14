/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const YEAR = staffYearForDate(new Date());
const ADMIN = "admin@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Generates a service-account-shaped RSA key and returns its PKCS#8 PEM. */
async function generatePrivateKeyPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const lines = b64.match(/.{1,64}/g)!.join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

const configureServiceAccount = (privateKey: string) => {
  vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "sa@project.iam.gserviceaccount.com");
  // The handler un-escapes \n, so feed it the escaped form a real env var has.
  vi.stubEnv("GOOGLE_SA_PRIVATE_KEY", privateKey.replace(/\n/g, "\\n"));
  vi.stubEnv("GOOGLE_ADMIN_IMPERSONATE", "admin@sow.org.au");
};

describe("directorySync.run", () => {
  test("records a failure when service-account env vars are missing", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("GOOGLE_SA_CLIENT_EMAIL", "");
    vi.stubEnv("GOOGLE_SA_PRIVATE_KEY", "");
    vi.stubEnv("GOOGLE_ADMIN_IMPERSONATE", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await t.action(internal.directorySync.run, {});
    expect(result).toBeNull();
    expect(error).toHaveBeenCalled();

    const state = await t.run((ctx) =>
      ctx.db
        .query("syncState")
        .withIndex("by_key", (q) => q.eq("key", "directory"))
        .unique()
    );
    expect(state?.detail).toMatch(/^failed: Directory sync is not configured/);
  });

  test("records a failure when the token exchange fails", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve("invalid_grant") })
    );

    await t.action(internal.directorySync.run, {});
    const state = await t.run((ctx) =>
      ctx.db
        .query("syncState")
        .withIndex("by_key", (q) => q.eq("key", "directory"))
        .unique()
    );
    expect(state?.detail).toMatch(/Google token exchange failed/);
  });

  test("records a failure when the directory API errors", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
      .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve("403 forbidden") });
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.directorySync.run, {});
    const state = await t.run((ctx) =>
      ctx.db
        .query("syncState")
        .withIndex("by_key", (q) => q.eq("key", "directory"))
        .unique()
    );
    expect(state?.detail).toMatch(/Directory API error/);
  });

  test("paginates, filters suspended users, lower-cases emails, and stores the list", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    const fetchMock = vi
      .fn()
      // 1) token exchange
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
      // 2) first directory page (has a nextPageToken)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            users: [
              { primaryEmail: "Alice@SOW.org.au", name: { fullName: "Alice A" } },
              { primaryEmail: "suspended@sow.org.au", suspended: true },
              { suspended: false }, // no primaryEmail -> filtered
            ],
            nextPageToken: "page2",
          }),
      })
      // 3) second directory page (no nextPageToken -> loop ends)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ users: [{ primaryEmail: "bob@sow.org.au" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await t.action(internal.directorySync.run, {});

    // Three fetches: one token + two directory pages.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The second directory page request carried the pageToken.
    expect(String(fetchMock.mock.calls[2][0])).toContain("pageToken=page2");

    const stored = await t.run((ctx) => ctx.db.query("directoryUsers").take(50));
    expect(stored.map((u) => u.email).sort()).toEqual(["alice@sow.org.au", "bob@sow.org.au"]);
    expect(stored.find((u) => u.email === "alice@sow.org.au")?.name).toBe("Alice A");

    const state = await t.run((ctx) =>
      ctx.db
        .query("syncState")
        .withIndex("by_key", (q) => q.eq("key", "directory"))
        .unique()
    );
    expect(state?.detail).toBe("synced 2 people");
  });
});

describe("directorySync.requestSync", () => {
  test("admins can kick off a sync (schedules the daily run)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    // requireAdmin passes for the seeded Data and IT admin; the run action it
    // schedules is exercised directly by the directorySync.run tests above.
    await expect(
      asUser(t, ADMIN).mutation(api.directorySync.requestSync, {})
    ).resolves.toBeNull();
  });

  test("non-admins cannot trigger a sync", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    // A provisioned but non-admin staff member: gets past the profile check
    // and is rejected by requireAdmin itself.
    await asUser(t, ADMIN).mutation(api.admin.upsertDepartment, {
      year: YEAR,
      name: "Marketing",
      division: "Engagement",
    });
    await asUser(t, ADMIN).mutation(api.admin.setStaffProfile, {
      email: "stranger@sow.org.au",
      year: YEAR,
      roles: ["Staff"],
      department: "Marketing",
    });
    await expect(
      asUser(t, "stranger@sow.org.au").mutation(api.directorySync.requestSync, {})
    ).rejects.toThrow(/Only admins/);
  });
});

describe("directorySync.store + list", () => {
  test("a second store replaces the whole list and updates the synced timestamp", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "one@sow.org.au", name: "One" }, { email: "two@sow.org.au" }],
    });
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "three@sow.org.au" }],
    });
    const listed = await asUser(t, ADMIN).query(api.directorySync.list, { year: YEAR });
    expect(listed?.users.map((u) => u.email)).toEqual(["three@sow.org.au"]);
    expect(listed?.status).toBe("synced 1 people");
    expect(listed?.syncedAt).toBeTypeOf("number");
  });
});
