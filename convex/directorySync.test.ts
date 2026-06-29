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

  test("caches a staff member's thumbnail and skips the re-fetch when unchanged", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    // alice is on the org chart (has a staffProfile) so her photo is cached;
    // bob is not, so his photo is never fetched even though he has an etag.
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", { email: "alice@sow.org.au", year: YEAR })
    );

    const directoryPage = {
      ok: true,
      json: () =>
        Promise.resolve({
          users: [
            { primaryEmail: "alice@sow.org.au", name: { fullName: "Alice" }, thumbnailPhotoEtag: "etag1" },
            { primaryEmail: "bob@sow.org.au", thumbnailPhotoEtag: "etagB" },
          ],
        }),
    };

    const firstFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
      .mockResolvedValueOnce(directoryPage)
      .mockResolvedValueOnce({
        ok: true,
        // "aGk*" is Google's web-safe encoding of "hi" (the `=` padding shows
        // up as `*`); the decoder must translate it back rather than choke.
        json: () => Promise.resolve({ photoData: "aGk*", mimeType: "image/png" }),
      });
    vi.stubGlobal("fetch", firstFetch);
    await t.action(internal.directorySync.run, {});

    // token + directory page + ONE photo fetch (alice only, not bob).
    expect(firstFetch).toHaveBeenCalledTimes(3);
    expect(String(firstFetch.mock.calls[2][0])).toContain(
      "/users/alice%40sow.org.au/photos/thumbnail"
    );

    const alice = await t.run((ctx) =>
      ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", "alice@sow.org.au"))
        .unique()
    );
    expect(alice?.photoId).toBeDefined();
    expect(alice?.photoEtag).toBe("etag1");
    // The web-safe payload decoded correctly to the original bytes.
    const photoText = await t.run(async (ctx) => {
      const blob = await ctx.storage.get(alice!.photoId!);
      return blob ? await blob.text() : null;
    });
    expect(photoText).toBe("hi");
    const bob = await t.run((ctx) =>
      ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", "bob@sow.org.au"))
        .unique()
    );
    expect(bob?.photoId).toBeUndefined();

    // A second sync with the same etag reuses the cached photo: no photo fetch.
    const secondFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
      .mockResolvedValueOnce(directoryPage);
    vi.stubGlobal("fetch", secondFetch);
    await t.action(internal.directorySync.run, {});

    expect(secondFetch).toHaveBeenCalledTimes(2); // token + page, no thumbnail
    const aliceAgain = await t.run((ctx) =>
      ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", "alice@sow.org.au"))
        .unique()
    );
    expect(aliceAgain?.photoId).toBe(alice?.photoId); // same stored file
  });

  test("a 404 from the photo endpoint just means no thumbnail (sync still succeeds)", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    await t.run((ctx) =>
      ctx.db.insert("staffProfiles", { email: "alice@sow.org.au", year: YEAR })
    );
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [{ primaryEmail: "alice@sow.org.au", thumbnailPhotoEtag: "etag1" }],
            }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve("not found") })
    );
    await t.action(internal.directorySync.run, {});

    const state = await t.run((ctx) =>
      ctx.db.query("syncState").withIndex("by_key", (q) => q.eq("key", "directory")).unique()
    );
    expect(state?.detail).toBe("synced 1 people");
    const alice = await t.run((ctx) =>
      ctx.db
        .query("directoryUsers")
        .withIndex("by_email", (q) => q.eq("email", "alice@sow.org.au"))
        .unique()
    );
    expect(alice?.photoId).toBeUndefined();
  });

  test("a non-404 photo error fails the sync and deletes already-uploaded thumbnails", async () => {
    const t = convexTest(schema, modules);
    configureServiceAccount(await generatePrivateKeyPem());
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const email of ["alice@sow.org.au", "carol@sow.org.au"]) {
      await t.run((ctx) => ctx.db.insert("staffProfiles", { email, year: YEAR }));
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok" }) })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              users: [
                { primaryEmail: "alice@sow.org.au", thumbnailPhotoEtag: "etagA" },
                { primaryEmail: "carol@sow.org.au", thumbnailPhotoEtag: "etagC" },
              ],
            }),
        })
        // alice's photo uploads, then carol's 403 throws.
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ photoData: "aGk*" }) })
        .mockResolvedValueOnce({ ok: false, status: 403, text: () => Promise.resolve("forbidden") })
    );
    await t.action(internal.directorySync.run, {});

    const state = await t.run((ctx) =>
      ctx.db.query("syncState").withIndex("by_key", (q) => q.eq("key", "directory")).unique()
    );
    expect(state?.detail).toMatch(/Directory photo API error.*403/);
    // alice's thumbnail, uploaded before carol failed, was cleaned up — no leak.
    const blobs = await t.run((ctx) => ctx.db.system.query("_storage").collect());
    expect(blobs).toHaveLength(0);
  });
});

describe("directorySync.store photo cleanup", () => {
  test("deletes replaced and removed thumbnails from storage", async () => {
    const t = convexTest(schema, modules);
    const [blob1, blob2] = await t.run(async (ctx) => [
      await ctx.storage.store(new Blob(["one"], { type: "image/png" })),
      await ctx.storage.store(new Blob(["two"], { type: "image/png" })),
    ]);
    // alice has a cached thumbnail (blob1).
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "alice@sow.org.au", photoId: blob1 }],
    });
    // alice drops out of the directory (her blob1 is deleted) and blob2 is
    // passed as a replaced/stale thumbnail to clean up.
    await t.mutation(internal.directorySync.store, { users: [], stalePhotoIds: [blob2] });

    expect(await t.run((ctx) => ctx.storage.getUrl(blob1))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(blob2))).toBeNull();
  });
});

describe("directorySync.requestSync", () => {
  test("admins can kick off a sync (schedules the weekly run)", async () => {
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

  test("store upserts existing users: updates changed names, preserves unchanged ones, removes absent users", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
    await t.mutation(internal.directorySync.store, {
      users: [
        { email: "one@sow.org.au", name: "Old Name" },
        { email: "two@sow.org.au", name: "Two" },
      ],
    });
    const initial = await t.run((ctx) => ctx.db.query("directoryUsers").take(100));
    const twoInitialId = initial.find((r) => r.email === "two@sow.org.au")?._id;
    expect(twoInitialId).toBeDefined();
    // Second sync: one gets a name update, two stays (same name, no patch), three is new
    await t.mutation(internal.directorySync.store, {
      users: [
        { email: "one@sow.org.au", name: "New Name" },
        { email: "three@sow.org.au" },
        { email: "two@sow.org.au", name: "Two" }, // same name — no patch, same _id
      ],
    });
    const rows = await t.run((ctx) => ctx.db.query("directoryUsers").take(100));
    const twoAfterSecondSync = rows.find((r) => r.email === "two@sow.org.au");
    expect(rows.find((r) => r.email === "one@sow.org.au")?.name).toBe("New Name");
    expect(twoAfterSecondSync?.name).toBe("Two");
    expect(twoAfterSecondSync?._id).toBe(twoInitialId); // not recreated
    expect(rows.find((r) => r.email === "three@sow.org.au")).toBeDefined();
    // Third sync: two is removed
    await t.mutation(internal.directorySync.store, {
      users: [{ email: "one@sow.org.au", name: "New Name" }, { email: "three@sow.org.au" }],
    });
    const final = await t.run((ctx) => ctx.db.query("directoryUsers").take(100));
    expect(final.find((r) => r.email === "two@sow.org.au")).toBeUndefined();
  });
});
