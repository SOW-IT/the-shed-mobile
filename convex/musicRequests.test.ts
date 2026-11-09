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

async function assignPraiseManager(
  t: TestConvex<typeof schema>,
  email = ADMIN,
) {
  await t.run(async (ctx) => {
    const settings = await ctx.db
      .query("yearSettings")
      .withIndex("by_year", (q) => q.eq("year", YEAR))
      .first();
    if (settings) {
      await ctx.db.patch(settings._id, { praiseManagerEmails: [email] });
    } else {
      await ctx.db.insert("yearSettings", {
        year: YEAR,
        praiseManagerEmails: [email],
      });
    }
  });
}

describe("music request indexed duplicates", () => {
  test("prevents approving an already-reviewed request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Already Reviewed Song",
        link: "https://example.com/already-reviewed",
      }),
    );

    // Approve the request once.
    await manager.mutation(api.musicRequests.approve, {
      requestId,
    });

    // Attempt to approve the same request again.
    await expect(
      manager.mutation(api.musicRequests.approve, {
        requestId,
      }),
    ).rejects.toThrow("This request has already been reviewed.");
  });
  test("prevents declining an already-reviewed request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Already Declined Song",
        link: "https://example.com/already-declined",
      }),
    );

    // Decline the request once.
    await manager.mutation(api.musicRequests.decline, {
      requestId,
      reason: "Not suitable",
    });

    // Attempt to decline the same request again.
    await expect(
      manager.mutation(api.musicRequests.decline, {
        requestId,
        reason: "Second attempt",
      }),
    ).rejects.toThrow("This request has already been reviewed.");
  });
  test("prevents editing a declined request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Declined Edit Song",
        link: "https://example.com/declined-edit",
      }),
    );

    await manager.mutation(api.musicRequests.decline, {
      requestId,
      reason: "Not suitable",
    });

    await expect(
      manager.mutation(api.musicRequests.update, {
        requestId,
        ...song({
          title: "Edited Declined Song",
          link: "https://example.com/edited-declined",
        }),
      }),
    ).rejects.toThrow("This request cannot be edited.");
  });
  test("prevents deleting a declined request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Declined Delete Song",
        link: "https://example.com/declined-delete",
      }),
    );

    await manager.mutation(api.musicRequests.decline, {
      requestId,
      reason: "Not suitable",
    });

    await expect(
      manager.mutation(api.musicRequests.remove, {
        requestId,
      }),
    ).rejects.toThrow("This request cannot be deleted.");
  });
  test("prevents approving a deleted request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Deleted Approval Song",
        link: "https://example.com/deleted-approval",
      }),
    );

    // Delete the pending request.
    await staff.mutation(api.musicRequests.remove, {
      requestId,
    });

    // Attempt to approve the deleted request.
    await expect(
      manager.mutation(api.musicRequests.approve, {
        requestId,
      }),
    ).rejects.toThrow("Request not found.");
  });
  test("prevents declining a deleted request", async () => {
    const t = await setup();
    await assignPraiseManager(t);

    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Deleted Decline Song",
        link: "https://example.com/deleted-decline",
      }),
    );

    // Delete the pending request.
    await staff.mutation(api.musicRequests.remove, {
      requestId,
    });

    // Attempt to decline the deleted request.
    await expect(
      manager.mutation(api.musicRequests.decline, {
        requestId,
        reason: "Not suitable",
      }),
    ).rejects.toThrow("Request not found.");
  });

  test("rejects unconfirmed possible duplicates on submission", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Same Song",
        artist: "Same Artist",
        link: "https://example.com/version-one",
      }),
    );

    const second = song({
      title: "Same Song",
      artist: "Same Artist",
      link: "https://example.com/version-two",
    });

    await expect(
      staff.mutation(api.musicRequests.submit, second),
    ).rejects.toThrow("Possible duplicate");

    await expect(
      staff.mutation(api.musicRequests.submit, {
        ...second,
        allowPossibleDuplicate: true,
      }),
    ).resolves.toBeDefined();
  });

  test("rejects empty and oversized music batches", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const tooMany = Array.from({ length: 51 }, (_, i) =>
      song({
        title: `Song ${i}`,
        link: `https://example.com/song-${i}`,
      }),
    );

    for (const songs of [[], tooMany]) {
      await expect(
        staff.mutation(api.musicRequests.previewBatch, { songs }),
      ).rejects.toThrow("Add between 1 and 50 songs.");

      await expect(
        staff.mutation(api.musicRequests.submitMany, { songs }),
      ).rejects.toThrow("Add between 1 and 50 songs.");
    }
  });

  test("skips unconfirmed possible duplicates in batch submissions", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Batch Duplicate",
        artist: "Example Artist",
        link: "https://example.com/original",
      }),
    );

    const result = await staff.mutation(api.musicRequests.submitMany, {
      songs: [
        song({
          title: "Batch Duplicate",
          artist: "Example Artist",
          link: "https://example.com/alternate",
        }),
      ],
    });

    expect(result).toMatchObject({
      added: 0,
      skipped: 1,
      possibleDuplicates: 1,
    });
  });

  test("prevents ordinary staff from viewing declined requests", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(staff.query(api.musicRequests.declined, {})).rejects.toThrow(
      "Only Praise Managers can view declined music requests.",
    );
  });

  test("rejects editing and deleting missing requests", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Temporary Song",
        link: "https://example.com/temporary",
      }),
    );

    await staff.mutation(api.musicRequests.remove, { requestId });

    await expect(
      staff.mutation(api.musicRequests.update, {
        requestId,
        ...song({
          title: "Updated Temporary Song",
          link: "https://example.com/updated-temporary",
        }),
      }),
    ).rejects.toThrow("Request not found.");

    await expect(
      staff.mutation(api.musicRequests.remove, { requestId }),
    ).rejects.toThrow("Request not found.");
  });

  test("prevents staff from editing another person's request", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const admin = asUser(t, ADMIN);

    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Private Song",
        link: "https://example.com/private-song",
      }),
    );

    await expect(
      admin.mutation(api.musicRequests.update, {
        requestId,
        ...song({
          title: "Unauthorized Edit",
          link: "https://example.com/unauthorized-edit",
        }),
      }),
    ).rejects.toThrow("You can only edit your own pending requests.");
  });

  test("rejects exact and unconfirmed possible duplicates when editing", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const original = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Original Recording",
        artist: "Artist A",
        link: SPOTIFY,
      }),
    );

    const editable = await staff.mutation(
      api.musicRequests.submit,
      song({
        title: "Editable Recording",
        artist: "Artist B",
        link: "https://example.com/editable-recording",
      }),
    );

    await expect(
      staff.mutation(api.musicRequests.update, {
        requestId: editable,
        ...song({
          title: "Original Recording",
          artist: "Artist A",
          link: SPOTIFY,
        }),
      }),
    ).rejects.toThrow("This recording has already been submitted.");

    await expect(
      staff.mutation(api.musicRequests.update, {
        requestId: editable,
        ...song({
          title: "Original Recording",
          artist: "Artist A",
          link: "https://example.com/different-version",
        }),
      }),
    ).rejects.toThrow("Possible duplicate");

    expect(original).toBeDefined();
  });

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

  test("allows unrelated songs within a batch preview", async () => {
    const t = await setup();
    const user = asUser(t, STAFF);

    const result = await user.mutation(api.musicRequests.previewBatch, {
      songs: [
        song(),
        song({
          title: "Completely Different Song",
          artist: "Another Artist",
          link: "https://www.youtube.com/watch?v=different123",
        }),
      ],
    });

    expect(result.exactDuplicates).toBe(0);
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

  test("lets a declined song be requested again", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const requestId = await staff.mutation(api.musicRequests.submit, {
      title: "Declined Song Test",
      artist: "Test Artist",
      link: SPOTIFY,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(requestId, {
        status: "DECLINED",
        reviewedByEmail: ADMIN,
        reviewedTime: Date.now(),
        declineComment: "Not suitable for the playlist",
      });
    });

    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: SPOTIFY,
        title: "Declined Song Test",
        artist: "Test Artist",
      }),
    ).toMatchObject({ kind: "declined", status: "DECLINED" });

    const againId = await staff.mutation(api.musicRequests.submit, {
      title: "Declined Song Test",
      artist: "Test Artist",
      link: SPOTIFY,
      requestComment: "We sing it at every weekly now",
    });
    expect(againId).not.toBe(requestId);

    await expect(
      staff.mutation(api.musicRequests.submit, {
        title: "Declined Song Test",
        artist: "Test Artist",
        link: SPOTIFY,
      }),
    ).rejects.toThrow("This recording was already requested (pending).");
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: SPOTIFY,
        title: "Declined Song Test",
        artist: "Test Artist",
      }),
    ).toMatchObject({ kind: "exact", status: "PENDING" });

    const mine = await staff.query(api.musicRequests.myRequests, {});
    expect(mine.map((row) => row.status).sort()).toEqual([
      "DECLINED",
      "PENDING",
    ]);
  });

  test("a declined song doesn't block or flag a batch", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const declinedId = await staff.mutation(api.musicRequests.submit, {
      title: "Batch Declined",
      artist: "Test Artist",
      link: SPOTIFY,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(declinedId, { status: "DECLINED" });
    });
    const songs = [
      { title: "Batch Declined", artist: "Test Artist", link: SPOTIFY },
      {
        title: "Batch Declined",
        artist: "Test Artist",
        link: "https://example.com/batch-declined-live",
      },
    ];

    expect(
      await staff.mutation(api.musicRequests.previewBatch, { songs }),
    ).toEqual({ exactDuplicates: 0, possibleDuplicates: 1 });
    expect(
      await staff.mutation(api.musicRequests.submitMany, {
        songs,
        allowPossibleDuplicates: true,
      }),
    ).toEqual({ added: 2, skipped: 0, possibleDuplicates: 0 });
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

  test("allows a Praise Manager to approve a pending request", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);
    const requestId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Approval Success",
        link: "https://example.com/approval-success",
      }),
    });

    await manager.mutation(api.musicRequests.approve, { requestId });

    const request = await t.run(async (ctx) => ctx.db.get(requestId));
    expect(request?.status).toBe("APPROVED");
    expect(request?.reviewedByEmail).toBe(ADMIN);
    expect(request?.reviewedTime).toBeDefined();
  });

  test("allows a Praise Manager to decline a pending request with a reason", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);
    const requestId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Decline Success",
        link: "https://example.com/decline-success",
      }),
    });

    await manager.mutation(api.musicRequests.decline, {
      requestId,
      reason: "Not suitable for this playlist",
    });

    const request = await t.run(async (ctx) => ctx.db.get(requestId));
    expect(request?.status).toBe("DECLINED");
    expect(request?.declineComment).toBe("Not suitable for this playlist");
    expect(request?.reviewedByEmail).toBe(ADMIN);
  });

  test("allows a Praise Manager to edit an approved request", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const manager = asUser(t, ADMIN);
    const requestId = await manager.mutation(api.musicRequests.submit, {
      ...song({
        title: "Original Approved",
        link: "https://example.com/original-approved",
      }),
    });

    await manager.mutation(api.musicRequests.update, {
      requestId,
      ...song({
        title: "Edited Approved",
        link: "https://example.com/edited-approved",
      }),
    });

    const request = await t.run(async (ctx) => ctx.db.get(requestId));
    expect(request?.title).toBe("Edited Approved");
    expect(request?.status).toBe("APPROVED");
  });

  test("allows an owner to delete their pending request", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const requestId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Delete Pending",
        link: "https://example.com/delete-pending",
      }),
    });

    await staff.mutation(api.musicRequests.remove, { requestId });

    const request = await t.run(async (ctx) => ctx.db.get(requestId));
    expect(request).toBeNull();
  });

  test("prevents ordinary staff from deleting approved requests", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);
    const requestId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Protected Approved",
        link: "https://example.com/protected-approved",
      }),
    });
    await manager.mutation(api.musicRequests.approve, { requestId });

    await expect(
      staff.mutation(api.musicRequests.remove, { requestId }),
    ).rejects.toThrow("You can only delete your own pending requests.");
  });

  test("allows Praise Managers to view pending and declined queues", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);
    const pendingId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Pending Queue Song",
        link: "https://example.com/pending-queue",
      }),
    });
    const declinedId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Declined Queue Song",
        link: "https://example.com/declined-queue",
      }),
    });
    await manager.mutation(api.musicRequests.decline, {
      requestId: declinedId,
    });

    const pending = await manager.query(api.musicRequests.toReview, {});
    const declined = await manager.query(api.musicRequests.declined, {});
    expect(pending.some((request) => request._id === pendingId)).toBe(true);
    expect(declined.some((request) => request._id === declinedId)).toBe(true);
  });

  test("allows staff to view approved music requests", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const manager = asUser(t, ADMIN);
    const staff = asUser(t, STAFF);
    const requestId = await manager.mutation(api.musicRequests.submit, {
      ...song({
        title: "Visible Approved",
        link: "https://example.com/visible-approved",
      }),
    });

    const approved = await staff.query(api.musicRequests.approved, {});
    expect(approved.some((request) => request._id === requestId)).toBe(true);
  });
  test("rejects missing song details and malformed music links", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const invalidSongs = [
      {
        input: song({ title: "   " }),
        error: "Every song needs a title, artist and link.",
      },
      {
        input: song({ artist: "   " }),
        error: "Every song needs a title, artist and link.",
      },
      {
        input: song({ link: "   " }),
        error: "Every song needs a title, artist and link.",
      },
      {
        input: song({ link: "not-a-valid-url" }),
        error: "Please enter a valid music link.",
      },
    ];

    for (const { input, error } of invalidSongs) {
      await expect(
        staff.mutation(api.musicRequests.submit, input),
      ).rejects.toThrow(error);
    }
  });
  test("rejects invalid ISRCs and oversized song fields", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    const invalidSongs = [
      {
        input: song({ isrc: "INVALID" }),
        error: "Invalid ISRC format.",
      },
      {
        input: song({ title: "A".repeat(201) }),
        error: "Song title must be 200 characters or fewer.",
      },
      {
        input: song({ artist: "A".repeat(201) }),
        error: "Artist name must be 200 characters or fewer.",
      },
      {
        input: song({ link: `https://example.com/${"a".repeat(2050)}` }),
        error: "Music link must be 2048 characters or fewer.",
      },
    ];

    for (const { input, error } of invalidSongs) {
      await expect(
        staff.mutation(api.musicRequests.submit, input),
      ).rejects.toThrow(error);
    }
  });
});

describe("Praise Manager administration", () => {
  test("rejects assigning a Praise Manager without a staff profile", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await expect(
      admin.mutation(api.admin.addPraiseManager, {
        year: YEAR,
        email: "missing.staff@sow.org.au",
      }),
    ).rejects.toThrow("has no staff profile");
  });

  test("updates existing year settings when assigning a Praise Manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    await t.run(async (ctx) => {
      const existing = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();

      if (!existing) {
        await ctx.db.insert("yearSettings", {
          year: YEAR,
          praiseManagerEmails: [],
        });
      }
    });

    const result = await admin.mutation(api.admin.addPraiseManager, {
      year: YEAR,
      email: STAFF,
    });

    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first(),
    );

    expect(settings).not.toBeNull();
    expect(settings?.praiseManagerEmails).toContain(STAFF);
    expect(result).toBe(settings?._id);
  });

  test("admin can add and remove a Praise Manager", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Assign a Praise Manager using the actual mutation.
    await admin.mutation(api.admin.addPraiseManager, {
      year: YEAR,
      email: STAFF,
    });

    // Verify the email was saved.
    let settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first(),
    );

    expect(settings?.praiseManagerEmails).toContain(STAFF);

    // Remove the Praise Manager.
    await admin.mutation(api.admin.removePraiseManager, {
      year: YEAR,
      email: STAFF,
    });

    // Verify the email was removed.
    settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first(),
    );

    expect(settings?.praiseManagerEmails ?? []).not.toContain(STAFF);
  });

  test("ordinary staff cannot assign or remove Praise Managers", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);

    await expect(
      staff.mutation(api.admin.addPraiseManager, {
        year: YEAR,
        email: STAFF,
      }),
    ).rejects.toThrow();

    await expect(
      staff.mutation(api.admin.removePraiseManager, {
        year: YEAR,
        email: STAFF,
      }),
    ).rejects.toThrow();
  });
});
describe("Praise Manager directory recognition", () => {
  test("recognizes Praise Managers regardless of email capitalization", async () => {
    const t = await setup();

    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();

      if (settings) {
        await ctx.db.patch(settings._id, {
          praiseManagerEmails: ["MUSIC.STAFF@SOW.ORG.AU"],
        });
      } else {
        await ctx.db.insert("yearSettings", {
          year: YEAR,
          praiseManagerEmails: ["MUSIC.STAFF@SOW.ORG.AU"],
        });
      }
    });

    const staff = asUser(t, STAFF);
    const result = await staff.query(api.directory.me, {});
    expect(result?.isPraiseManager).toBe(true);
  });
});
test("handles malformed URLs during duplicate checking", async () => {
  const t = await setup();
  const user = asUser(t, STAFF);

  await user.mutation(api.musicRequests.submit, song());

  const duplicate = await user.query(
    api.musicRequests.checkDuplicate,
    song({
      title: "Another Song",
      artist: "Another Artist",
      link: "not-a-valid-url",
    }),
  );

  expect(duplicate).toBeNull();
});
describe("Praise Manager staff profile cleanup", () => {
  test("removing a staff profile also removes Praise Manager access", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);

    // Assign the staff member as a Praise Manager.
    await admin.mutation(api.admin.addPraiseManager, {
      year: YEAR,
      email: STAFF,
    });

    // Remove their staff profile.
    await admin.mutation(api.admin.removeStaffProfile, {
      year: YEAR,
      email: STAFF,
    });

    // Check that their Praise Manager assignment was removed.
    const settings = await t.run(async (ctx) =>
      ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first(),
    );

    expect(settings?.praiseManagerEmails ?? []).not.toContain(STAFF);

    // Check that their staff profile no longer exists.
    const profile = await t.run(async (ctx) =>
      ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", STAFF).eq("year", YEAR),
        )
        .first(),
    );

    expect(profile).toBeNull();
  });
});

describe("Praise List while acting as a role", () => {
  const actAs = (
    t: TestConvex<typeof schema>,
    persona: { role: "praiseManager" } | { role: "staff"; department: string },
  ) => asUser(t, ADMIN).mutation(api.actingAs.set, { persona });

  test("a Praise Manager acting as staff sees the staff view and no review buttons", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const admin = asUser(t, ADMIN);
    expect(await admin.query(api.directory.me, {})).toMatchObject({
      isPraiseManager: true,
      canManagePraiseList: true,
    });

    await actAs(t, { role: "staff", department: "Music" });
    expect(await admin.query(api.directory.me, {})).toMatchObject({
      isPraiseManager: false,
      canManagePraiseList: false,
      songsSkipReview: true,
    });
    await expect(admin.query(api.musicRequests.toReview, {})).rejects.toThrow(
      "Only Praise Managers can review music requests.",
    );
    await expect(admin.query(api.musicRequests.declined, {})).rejects.toThrow(
      "Only Praise Managers can view declined music requests.",
    );
  });

  test("an admin acting as Praise Manager sees the queue but can't approve", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const requestId = await asUser(t, STAFF).mutation(
      api.musicRequests.submit,
      song({ link: "https://example.com/preview-queue" }),
    );

    await actAs(t, { role: "praiseManager" });
    expect(await admin.query(api.directory.me, {})).toMatchObject({
      isPraiseManager: true,
      canManagePraiseList: false,
    });
    const queue = await admin.query(api.musicRequests.toReview, {});
    expect(queue.map((row) => row._id)).toEqual([requestId]);
    await expect(
      admin.mutation(api.musicRequests.approve, { requestId }),
    ).rejects.toThrow("Only Praise Managers can approve music requests.");
  });
});

describe("Praise List details", () => {
  test("the review queue and notifications name the requester", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", STAFF).eq("year", YEAR),
        )
        .first();
      await ctx.db.patch(profile!._id, { name: "Hana Doe" });
    });
    const staff = asUser(t, STAFF);
    await staff.mutation(api.musicRequests.submit, song());
    await staff.mutation(api.musicRequests.submitMany, {
      songs: [
        song({ title: "Second", link: "https://example.com/second" }),
        song({ title: "Third", link: "https://example.com/third" }),
      ],
    });
    await staff.mutation(api.musicRequests.submitMany, {
      songs: [song({ title: "Fourth", link: "https://example.com/fourth" })],
    });

    const queue = await asUser(t, ADMIN).query(api.musicRequests.toReview, {});
    expect(queue.map((row) => row.requesterName)).toEqual([
      "Hana Doe",
      "Hana Doe",
      "Hana Doe",
      "Hana Doe",
    ]);
    const bodies = await t.run(async (ctx) =>
      (await ctx.db.query("notifications").collect())
        .filter((row) => row.userEmail === ADMIN)
        .map((row) => row.body),
    );
    expect(bodies).toEqual([
      'Hana Doe requested "Test Song"',
      "Hana Doe requested 2 songs.",
      "Hana Doe requested 1 song.",
    ]);
  });

  test("checking duplicates while editing skips the request being edited", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const link = "https://www.youtube.com/watch?v=abcdefghijk";
    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({ link }),
    );
    const check = { link, title: "Test Song", artist: "Test Artist" };

    expect(
      await staff.query(api.musicRequests.checkDuplicate, check),
    ).toMatchObject({ kind: "exact" });
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        ...check,
        excludeId: requestId,
      }),
    ).toBeNull();
  });

  test("Spotify and YouTube lookups need a signed-in user", async () => {
    const t = await setup();
    await expect(
      t.action(api.spotify.getTrack, { link: SPOTIFY }),
    ).rejects.toThrow("You must be signed in.");
    await expect(
      t.action(api.youtube.importPlaylist, {
        link: "https://www.youtube.com/playlist?list=PL123",
      }),
    ).rejects.toThrow("You must be signed in.");
  });

  test("the backfill fills the duplicate keys with submit's rules", async () => {
    const t = await setup();
    const id = await t.run((ctx) =>
      ctx.db.insert("musicRequests", {
        requesterEmail: STAFF,
        title: "Test  Song!",
        artist: "TEST Artist",
        link: SPOTIFY,
        status: "APPROVED",
      }),
    );
    expect(await t.mutation(internal.musicBackfill.backfill, {})).toMatchObject(
      {
        checked: 1,
        updated: 1,
        isDone: true,
      },
    );
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({
      spotifyTrackId: TRACK_ID,
      normalizedSongKey: JSON.stringify(["test song", "test artist"]),
    });
    expect(await t.mutation(internal.musicBackfill.backfill, {})).toMatchObject(
      {
        updated: 0,
      },
    );
  });
});

describe("Praise List review follow-up", () => {
  const scheduledPushes = (t: TestConvex<typeof schema>) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name === "push:send")
        .map((job) => job.args[0] as { to: string; title: string }),
    );

  test("the same YouTube video is refused whatever its title or link form", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    await staff.mutation(
      api.musicRequests.submit,
      song({ link: "https://www.youtube.com/watch?v=abcdefghijk&t=30" }),
    );

    await expect(
      staff.mutation(
        api.musicRequests.submit,
        song({
          title: "A different title",
          artist: "Someone else",
          link: "https://youtu.be/abcdefghijk",
        }),
      ),
    ).rejects.toThrow("This recording was already requested (pending).");
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: "https://music.youtube.com/watch?v=abcdefghijk",
        title: "Anything",
        artist: "Anyone",
      }),
    ).toMatchObject({ kind: "exact", title: "Test Song" });
    expect(
      await staff.mutation(api.musicRequests.submitMany, {
        songs: [
          song({
            title: "Other",
            link: "https://m.youtube.com/shorts/abcdefghijk",
          }),
        ],
      }),
    ).toEqual({ added: 0, skipped: 1, possibleDuplicates: 0 });
  });

  test("an http Spotify link is the same track as its https link", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    await staff.mutation(api.musicRequests.submit, song());

    const httpLink = `http://open.spotify.com/track/${TRACK_ID}`;
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: httpLink,
        title: "Anything",
        artist: "Anyone",
      }),
    ).toMatchObject({ kind: "exact", title: "Test Song" });
    await expect(
      staff.mutation(
        api.musicRequests.submit,
        song({ title: "A different title", artist: "Someone else", link: httpLink }),
      ),
    ).rejects.toThrow("This recording was already requested (pending).");
  });

  test("YouTube songs keep the video's thumbnail; Spotify artwork must come from Spotify", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const youtubeId = await staff.mutation(api.musicRequests.submit, {
      ...song({ link: "https://youtu.be/abcdefghijk" }),
      albumArtUrl: "https://example.com/tracker.gif",
    });
    const spotifyId = await staff.mutation(api.musicRequests.submit, {
      ...song({ title: "Spotify song" }),
      albumArtUrl: "https://i.scdn.co/image/ab67616d",
    });
    const otherHostId = await staff.mutation(api.musicRequests.submit, {
      ...song({
        title: "Elsewhere",
        link: "https://open.spotify.com/track/0000000000000000000000",
      }),
      albumArtUrl: "https://example.com/cover.jpg",
    });
    const typedId = await staff.mutation(api.musicRequests.submit, {
      ...song({ title: "Typed", link: "https://example.com/song" }),
      albumArtUrl: "https://i.scdn.co/image/ab67616d",
    });

    const rows = await t.run(async (ctx) =>
      Promise.all(
        [youtubeId, spotifyId, otherHostId, typedId].map((id) =>
          ctx.db.get("musicRequests", id),
        ),
      ),
    );
    expect(rows.map((row) => row?.albumArtUrl)).toEqual([
      "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
      "https://i.scdn.co/image/ab67616d",
      undefined,
      undefined,
    ]);
    expect(rows[0]?.youtubeVideoId).toBe("abcdefghijk");
  });

  test("requests, approvals and declines also go out as push notifications", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const first = await staff.mutation(api.musicRequests.submit, song());
    const second = await staff.mutation(
      api.musicRequests.submit,
      song({ title: "Second", link: "https://example.com/second" }),
    );
    await asUser(t, ADMIN).mutation(api.musicRequests.approve, {
      requestId: first,
    });
    await asUser(t, ADMIN).mutation(api.musicRequests.decline, {
      requestId: second,
      reason: "Not singable",
    });

    expect(await scheduledPushes(t)).toEqual([
      expect.objectContaining({ to: ADMIN, title: "New music request" }),
      expect.objectContaining({ to: ADMIN, title: "New music request" }),
      expect.objectContaining({ to: STAFF, title: "Music request approved" }),
      expect.objectContaining({ to: STAFF, title: "Music request declined" }),
    ]);
  });

  test("a Praise Manager's own songs notify nobody", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    await asUser(t, ADMIN).mutation(api.musicRequests.submit, song());
    expect(await scheduledPushes(t)).toEqual([]);
  });

  test("the side menu badge counts pending songs for whoever reviews them", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const admin = asUser(t, ADMIN);
    await staff.mutation(api.musicRequests.submit, song());
    await staff.mutation(
      api.musicRequests.submit,
      song({ title: "Second", link: "https://example.com/second" }),
    );

    expect(await admin.query(api.musicRequests.waitingOnMe, {})).toBe(2);
    expect(await staff.query(api.musicRequests.waitingOnMe, {})).toBe(0);
    expect(await t.query(api.musicRequests.waitingOnMe, {})).toBe(0);

    await admin.mutation(api.actingAs.set, {
      persona: { role: "staff", department: "Music" },
    });
    expect(await admin.query(api.musicRequests.waitingOnMe, {})).toBe(0);
  });

  test("an admin acting as Praise Manager sees the badge that role would see", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await asUser(t, STAFF).mutation(api.musicRequests.submit, song());

    expect(await admin.query(api.musicRequests.waitingOnMe, {})).toBe(0);
    await admin.mutation(api.actingAs.set, {
      persona: { role: "praiseManager" },
    });
    expect(await admin.query(api.musicRequests.waitingOnMe, {})).toBe(1);
    expect(
      (await admin.query(api.waitingOnMe.summary, {}))?.songs,
    ).toEqual({ toReview: 1 });
  });

  test("the backfill fills YouTube video IDs and thumbnails", async () => {
    const t = await setup();
    const id = await t.run((ctx) =>
      ctx.db.insert("musicRequests", {
        requesterEmail: STAFF,
        title: "Old",
        artist: "Song",
        link: "https://youtu.be/abcdefghijk",
        status: "APPROVED",
      }),
    );
    await t.mutation(internal.musicBackfill.backfill, {});
    expect(await t.run((ctx) => ctx.db.get("musicRequests", id))).toMatchObject(
      {
        youtubeVideoId: "abcdefghijk",
        albumArtUrl: "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
      },
    );
    expect(await t.mutation(internal.musicBackfill.backfill, {})).toMatchObject(
      {
        updated: 0,
      },
    );
  });

  test("the backfill drops artwork a Spotify song didn't get from Spotify", async () => {
    const t = await setup();
    const insert = (link: string, albumArtUrl: string) =>
      t.run((ctx) =>
        ctx.db.insert("musicRequests", {
          requesterEmail: STAFF,
          title: "Old",
          artist: "Song",
          link,
          albumArtUrl,
          status: "APPROVED",
        }),
      );
    const youtubeArt = "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg";
    const spotifyArt = "https://i.scdn.co/image/abc";
    const wrongArt = await insert(SPOTIFY, youtubeArt);
    const rightArt = await insert(`https://open.spotify.com/track/${TRACK_ID}2`, spotifyArt);
    const otherLink = await insert("https://example.com/song", youtubeArt);

    await t.mutation(internal.musicBackfill.backfill, {});
    const art = await t.run(async (ctx) =>
      Promise.all(
        [wrongArt, rightArt, otherLink].map(
          async (id) =>
            (await ctx.db.get("musicRequests", id))?.albumArtUrl ?? null,
        ),
      ),
    );
    expect(art).toEqual([null, spotifyArt, youtubeArt]);
  });

  test("editing a request moves its duplicate keys to the new song", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const requestId = await staff.mutation(
      api.musicRequests.submit,
      song({ link: "https://youtu.be/abcdefghijk" }),
    );
    await staff.mutation(api.musicRequests.update, {
      requestId,
      ...song({ title: "New", link: "https://youtu.be/bcdefghijkl" }),
    });

    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: "https://youtu.be/abcdefghijk",
        title: "Unrelated",
        artist: "Unrelated",
      }),
    ).toBeNull();
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: "https://www.youtube.com/watch?v=bcdefghijkl",
        title: "Unrelated",
        artist: "Unrelated",
      }),
    ).toMatchObject({ kind: "exact", title: "New" });
  });

  test("notifications keep a multi-line decline reason on one line", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    const requestId = await asUser(t, STAFF).mutation(
      api.musicRequests.submit,
      song(),
    );
    await asUser(t, ADMIN).mutation(api.musicRequests.decline, {
      requestId,
      reason: "Wrong key.\nTry the acoustic version.",
    });

    const declined = await t.run(async (ctx) =>
      (await ctx.db.query("notifications").collect()).find(
        (row) => row.userEmail === STAFF,
      ),
    );
    expect(declined?.body).toBe(
      '"Test Song" was declined: Wrong key. Try the acoustic version.',
    );
  });

  test("a batch preview tells apart two videos with the same title", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    await staff.mutation(
      api.musicRequests.submit,
      song({ link: "https://youtu.be/abcdefghijk" }),
    );

    expect(
      await staff.mutation(api.musicRequests.previewBatch, {
        songs: [
          song({ link: "https://youtu.be/abcdefghijk" }),
          song({ link: "https://youtu.be/bcdefghijkl" }),
        ],
      }),
    ).toEqual({ exactDuplicates: 1, possibleDuplicates: 1 });
  });

  test("the backfill carries on by itself past the first page", async () => {
    const t = await setup();
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("musicRequests", {
          requesterEmail: STAFF,
          title: `Song ${i}`,
          artist: "Artist",
          link: `https://youtu.be/abcdefgh${String(i).padStart(3, "0")}`,
          status: "APPROVED",
        });
      }
    });

    const first = await t.mutation(internal.musicBackfill.backfill, {});
    expect(first).toMatchObject({ checked: 100, isDone: false });
    const next = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) => job.name === "musicBackfill:backfill",
      ),
    );
    expect(next.map((job) => job.args[0])).toEqual([
      { cursor: first.continueCursor },
    ]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.run((ctx) => ctx.db.query("musicRequests").collect());
    expect(rows).toHaveLength(101);
    for (const row of rows) {
      const videoId = row.link.slice(-11);
      expect(row).toMatchObject({
        youtubeVideoId: videoId,
        normalizedSongKey: expect.any(String),
        albumArtUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      });
    }
  });

  test("after 1 October a Praise Manager needs this year's staff profile", async () => {
    const t = await setup();
    const requestId = await asUser(t, STAFF).mutation(
      api.musicRequests.submit,
      song(),
    );
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", {
        year: YEAR + 1,
        praiseManagerEmails: [STAFF],
      }),
    );
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 10 * 86_400_000);
    const staff = asUser(t, STAFF);

    expect(await staff.query(api.directory.me, {})).toMatchObject({
      isPraiseManager: false,
      canManagePraiseList: false,
    });
    await expect(
      staff.mutation(api.musicRequests.approve, { requestId }),
    ).rejects.toThrow("Only Praise Managers can approve music requests.");

    await t.run(async (ctx) => {
      const current = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", STAFF).eq("year", YEAR),
        )
        .first();
      const { _id, _creationTime, ...profile } = current!;
      await ctx.db.insert("staffProfiles", { ...profile, year: YEAR + 1 });
    });
    expect(await staff.query(api.directory.me, {})).toMatchObject({
      isPraiseManager: true,
      canManagePraiseList: true,
    });
    await staff.mutation(api.musicRequests.approve, { requestId });
  });
});
