/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const YEAR = staffYearForDate(new Date());
const PINNED_NOW = staffYearStartMs(YEAR) + 150 * 86_400_000;

const ADMIN = "admin@sow.org.au";
const STAFF = "music.staff@sow.org.au";

const TRACK_ID = "3cmaB3jaMbVLVbXwTkzaew";
const SPOTIFY = `https://open.spotify.com/track/${TRACK_ID}?si=6a8ccfe7cd03456c`;

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);

  await t.mutation(internal.admin.seed, {
    adminEmail: ADMIN,
  });

  const admin = asUser(t, ADMIN);

  // Create the department before assigning staff to it.
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Music",
    division: "Engagement",
    headEmail: ADMIN,
  });

  await admin.mutation(api.admin.setStaffProfile, {
    year: YEAR,
    email: STAFF,
    roles: ["Staff"],
    department: "Music",
  });

  return t;
}

const song = (
  overrides: Partial<{
    title: string;
    artist: string;
    link: string;
    isrc: string;
  }> = {},
) => ({
  title: "Test Song",
  artist: "Test Artist",
  link: SPOTIFY,
  ...overrides,
});

describe("music request indexed duplicates", () => {
  test("prevents ordinary staff from approving requests", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Permission Test Song",
      artist: "Test Artist",
      link: "https://example.com/permission-test",
    });

    await expect(
      staff.mutation(api.musicRequests.approve, { requestId }),
    ).rejects.toThrow("Only Praise Managers can approve music requests.");
  });

  test("prevents ordinary staff from declining requests", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Decline Permission Test",
      artist: "Test Artist",
      link: "https://example.com/decline-permission",
    });

    await expect(
      staff.mutation(api.musicRequests.decline, {
        requestId,
        reason: "Testing permissions",
      }),
    ).rejects.toThrow("Only Praise Managers can decline music requests.");
  });

  test("recognizes Spotify URLs with different parameters", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(api.musicRequests.submit, song());

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song({
        title: "Different Title",
        artist: "Different Artist",
        link: `${SPOTIFY}?si=example`,
      }),
    );

    expect(duplicate?.kind).toBe("exact");
    expect(duplicate?.status).toBe("PENDING");
  });

  test("recognizes matching ISRCs across music platforms", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(
      api.musicRequests.submit,
      song({ isrc: "USRC17607839" }),
    );

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song({
        title: "Another Title",
        artist: "Another Artist",
        link: "https://music.apple.com/example",
        isrc: "usrc17607839",
      }),
    );

    expect(duplicate?.kind).toBe("exact");
  });

  test("normalizes capitalization and punctuation", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(
      api.musicRequests.submit,
      song({
        title: "Amazing-Song!",
        artist: "Example Artist",
      }),
    );

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song({
        title: "AMAZING SONG",
        artist: "example artist",
        link: "https://www.youtube.com/watch?v=example",
      }),
    );

    expect(duplicate?.kind).toBe("possible");
  });

  test("returns null for unrelated songs", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(api.musicRequests.submit, song());

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song({
        title: "Unrelated Song",
        artist: "Another Artist",
        link: "https://example.com/another-song",
      }),
    );

    expect(duplicate).toBeNull();
  });

  test("prefers exact matches over possible matches", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(
      api.musicRequests.submit,
      song({
        title: "Same Title",
        artist: "Same Artist",
        link: "https://example.com/version-one",
      }),
    );

    await user.mutation(
      api.musicRequests.submit,
      song({
        title: "Different Title",
        artist: "Different Artist",
      }),
    );

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song({
        title: "Same Title",
        artist: "Same Artist",
      }),
    );

    expect(duplicate?.kind).toBe("exact");
    expect(duplicate?.title).toBe("Different Title");
  });

  test("prefers approved over pending exact duplicates", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    const requestId = await user.mutation(
      api.musicRequests.submit,
      song({ title: "Pending Version" }),
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("musicRequests", {
        requesterEmail: STAFF,
        title: "Approved Version",
        artist: "Other Artist",
        link: SPOTIFY,
        spotifyTrackId: TRACK_ID,
        normalizedSongKey: JSON.stringify(["approved version", "other artist"]),
        status: "APPROVED",
      });
    });

    const duplicate = await user.query(
      api.musicRequests.checkDuplicate,
      song(),
    );

    expect(duplicate?.kind).toBe("exact");
    expect(duplicate?.status).toBe("APPROVED");
    expect(duplicate?.title).toBe("Approved Version");

    expect(requestId).toBeTruthy();
  });

  test("allows editing a request without matching itself", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    const requestId = await user.mutation(api.musicRequests.submit, song());

    await expect(
      user.mutation(api.musicRequests.update, {
        requestId,
        ...song({ title: "Updated Title" }),
      }),
    ).resolves.toBeNull();

    const rows = await user.query(api.musicRequests.myRequests, {});
    expect(rows[0].title).toBe("Updated Title");
  });

  test("detects identical songs within a batch preview", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    const result = await user.mutation(api.musicRequests.previewBatch, {
      songs: [song(), song()],
    });

    expect(result.exactDuplicates).toBe(1);
    expect(result.possibleDuplicates).toBe(0);
  });

  test("skips the second identical song in batch submission", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    const result = await user.mutation(api.musicRequests.submitMany, {
      songs: [song(), song()],
    });

    expect(result.added).toBe(1);
    expect(result.skipped).toBe(1);

    const rows = await user.query(api.musicRequests.myRequests, {});
    expect(rows).toHaveLength(1);
  });

  test("rejects exact duplicates on individual submission", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    await user.mutation(api.musicRequests.submit, song());

    await expect(
      user.mutation(api.musicRequests.submit, song()),
    ).rejects.toThrow(/already requested/i);
  });

  test("automatically approves songs submitted by Praise Managers", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();

      if (settings) {
        await ctx.db.patch(settings._id, {
          praiseManagerEmails: [ADMIN],
        });
      } else {
        await ctx.db.insert("yearSettings", {
          year: YEAR,
          praiseManagerEmails: [ADMIN],
        });
      }
    });

    const requestId = await admin.mutation(api.musicRequests.submit, {
      title: "Manager Auto Approval Test",
      artist: "Test Artist",
      link: "https://example.com/manager-auto-approval",
    });

    const request = await t.run(async (ctx) => ctx.db.get(requestId));

    expect(request?.status).toBe("APPROVED");
    expect(request?.reviewedByEmail).toBe(ADMIN);
    expect(request?.reviewedTime).toBeDefined();
  });

  test("prevents resubmission of declined songs", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Declined Song Test",
      artist: "Test Artist",
      link: SPOTIFY,
    });

    // Simulate a Praise Manager declining the request.
    await t.run(async (ctx) => {
      await ctx.db.patch(requestId, {
        status: "DECLINED",
        reviewedByEmail: ADMIN,
        reviewedTime: Date.now(),
        declineComment: "Not suitable for the playlist",
      });
    });

    // Attempt to request the same recording again.
    await expect(
      staff.mutation(api.musicRequests.submit, {
        title: "Declined Song Test",
        artist: "Test Artist",
        link: SPOTIFY,
      }),
    ).rejects.toThrow("This recording was already requested (declined).");
  });
  test("rejects request comments longer than 2000 characters", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(
      staff.mutation(api.musicRequests.submit, {
        title: "Long Comment Test",
        artist: "Test Artist",
        link: "https://example.com/long-comment",
        requestComment: "A".repeat(2001),
      }),
    ).rejects.toThrow("Request comment must be 2000 characters or fewer.");
  });
  test("rejects long comments in batch submissions", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(
      staff.mutation(api.musicRequests.submitMany, {
        songs: [
          {
            title: "Batch Comment Test",
            artist: "Test Artist",
            link: "https://example.com/batch-comment",
          },
        ],
        requestComment: "A".repeat(2001),
      }),
    ).rejects.toThrow("Request comment must be 2000 characters or fewer.");
  });

  test("rejects request comments longer than 2000 characters when editing", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Edit Comment Test",
      artist: "Test Artist",
      link: "https://example.com/edit-comment",
    });

    await expect(
      staff.mutation(api.musicRequests.update, {
        requestId,
        title: "Edit Comment Test",
        artist: "Test Artist",
        link: "https://example.com/edit-comment",
        requestComment: "A".repeat(2001),
      }),
    ).rejects.toThrow("Request comment must be 2000 characters or fewer.");
  });

  test("rejects javascript URLs in music requests", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(
      staff.mutation(api.musicRequests.submit, {
        title: "Invalid URL Test",
        artist: "Test Artist",
        link: "javascript:alert(1)",
      }),
    ).rejects.toThrow("Please enter a valid HTTP or HTTPS music link.");
  });

  test("prevents ordinary staff from accessing the review queue", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(staff.query(api.musicRequests.toReview, {})).rejects.toThrow(
      "Only Praise Managers can review music requests.",
    );
  });

  test("rejects decline reasons longer than 2000 characters", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const admin = asUser(t, ADMIN);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Long Decline Reason Test",
      artist: "Test Artist",
      link: "https://example.com/long-decline-reason",
    });

    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      if (settings) {
        await ctx.db.patch(settings._id, {
          praiseManagerEmails: [ADMIN],
        });
      } else {
        await ctx.db.insert("yearSettings", {
          year: YEAR,
          praiseManagerEmails: [ADMIN],
        });
      }
    });

    await expect(
      admin.mutation(api.musicRequests.decline, {
        requestId,
        reason: "A".repeat(2001),
      }),
    ).rejects.toThrow("Decline reason must be 2000 characters or fewer.");

    // An invalid decline attempt must leave the request pending.
    const request = await t.run(async (ctx) => ctx.db.get(requestId));
    expect(request?.status).toBe("PENDING");
  });
});
