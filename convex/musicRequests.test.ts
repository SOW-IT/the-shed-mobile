
import { describe, expect, test, vi } from "vitest";
import { staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import { type Caller, type T, YEAR, ADMIN, newConvex, asUser, pinClock } from "../test/convexFixture";
import type { Id } from "./_generated/dataModel";

const PINNED_NOW = staffYearStartMs(YEAR) + 150 * 86_400_000;

const STAFF = "music.staff@sow.org.au";

const TRACK_ID = "3cmaB3jaMbVLVbXwTkzaew";
const LONG = "A".repeat(2001);
const SPOTIFY = `https://open.spotify.com/track/${TRACK_ID}?si=6a8ccfe7cd03456c`;

pinClock(PINNED_NOW);

async function setup() {
  const t = newConvex();

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
  t: T,
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
  test.each([
    ["approving an approved request", "approve", "approve", "This request has already been reviewed."],
    ["declining a declined request", "decline", "decline", "This request has already been reviewed."],
    ["editing a declined request", "decline", "update", "This request cannot be edited."],
    ["deleting a declined request", "decline", "remove", "This request cannot be deleted."],
    ["approving a deleted request", "remove", "approve", "Request not found."],
    ["declining a deleted request", "remove", "decline", "Request not found."],
  ] as const)("refuses %s", async (_, first, then, error) => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const manager = asUser(t, ADMIN);
    const requestId = await staff.mutation(api.musicRequests.submit, song());
    const act = (action: "approve" | "decline" | "update" | "remove") => {
      if (action === "approve") return manager.mutation(api.musicRequests.approve, { requestId });
      if (action === "decline") {
        return manager.mutation(api.musicRequests.decline, { requestId, reason: "Not suitable" });
      }
      if (action === "update") {
        return manager.mutation(api.musicRequests.update, { requestId, ...song({ title: "Edited" }) });
      }
      return (first === "remove" ? staff : manager).mutation(api.musicRequests.remove, { requestId });
    };

    await act(first);
    await expect(act(then)).rejects.toThrow(error);
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

  test.each([
    [
      "see the review queue",
      (staff: Caller) => staff.query(api.musicRequests.toReview, {}),
      "Only Praise Managers can review music requests.",
    ],
    [
      "see declined requests",
      (staff: Caller) => staff.query(api.musicRequests.declined, {}),
      "Only Praise Managers can view declined music requests.",
    ],
    [
      "approve a request",
      (staff: Caller, requestId: Id<"musicRequests">) =>
        staff.mutation(api.musicRequests.approve, { requestId }),
      "Only Praise Managers can approve music requests.",
    ],
    [
      "decline a request",
      (staff: Caller, requestId: Id<"musicRequests">) =>
        staff.mutation(api.musicRequests.decline, { requestId, reason: "No" }),
      "Only Praise Managers can decline music requests.",
    ],
  ])("ordinary staff can't %s", async (_, act, error) => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const requestId = await staff.mutation(api.musicRequests.submit, song());
    await expect(act(staff, requestId)).rejects.toThrow(error);
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

  test("automatically approves songs submitted by Praise Managers", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    await assignPraiseManager(t);

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
    expect(mine.map((row) => row.status).sort()).toEqual(["DECLINED", "PENDING"]);
  });

  test("Request again's check finds the recording only once someone else has it open", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const declinedId = await staff.mutation(api.musicRequests.submit, {
      title: "Again Song",
      artist: "Test Artist",
      link: SPOTIFY,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(declinedId, { status: "DECLINED" });
    });
    const [declined] = await staff.query(api.musicRequests.myRequests, {});
    expect(declined).not.toHaveProperty("canRequestAgain");
    const check = () =>
      staff.query(api.musicRequests.checkDuplicate, {
        link: declined.link,
        title: declined.title,
        artist: declined.artist,
        isrc: declined.isrc,
        excludeId: declined._id,
      });

    expect(await check()).toBeNull();
    await asUser(t, ADMIN).mutation(api.musicRequests.submit, {
      title: "Again Song",
      artist: "Test Artist",
      link: SPOTIFY,
    });
    expect(await check()).toMatchObject({ kind: "exact" });
  });

  test("says when a declined match is only the same title and artist", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const declinedId = await staff.mutation(api.musicRequests.submit, {
      title: "Version Song",
      artist: "Test Artist",
      link: SPOTIFY,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(declinedId, { status: "DECLINED" });
    });

    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: SPOTIFY,
        title: "Version Song",
        artist: "Test Artist",
      }),
    ).toMatchObject({ kind: "declined", sameRecording: true });
    expect(
      await staff.query(api.musicRequests.checkDuplicate, {
        link: "https://example.com/version-song-live",
        title: "Version Song",
        artist: "Test Artist",
      }),
    ).toMatchObject({ kind: "declined", sameRecording: false });
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
  test.each([
    [
      "a request comment",
      (staff: Caller) =>
        staff.mutation(api.musicRequests.submit, { ...song({ title: "New" }), requestComment: LONG }),
      "Request comment must be 2000 characters or fewer.",
    ],
    [
      "a batch comment",
      (staff: Caller) =>
        staff.mutation(api.musicRequests.submitMany, {
          songs: [song({ title: "New" })],
          requestComment: LONG,
        }),
      "Request comment must be 2000 characters or fewer.",
    ],
    [
      "an edited comment",
      (staff: Caller, requestId: Id<"musicRequests">) =>
        staff.mutation(api.musicRequests.update, { requestId, ...song(), requestComment: LONG }),
      "Request comment must be 2000 characters or fewer.",
    ],
    [
      "a decline reason",
      (_: Caller, requestId: Id<"musicRequests">, manager: Caller) =>
        manager.mutation(api.musicRequests.decline, { requestId, reason: LONG }),
      "Decline reason must be 2000 characters or fewer.",
    ],
  ])("rejects %s over 2000 characters and leaves the request pending", async (_, act, error) => {
    const t = await setup();
    await assignPraiseManager(t);
    const staff = asUser(t, STAFF);
    const requestId = await staff.mutation(api.musicRequests.submit, song());

    await expect(act(staff, requestId, asUser(t, ADMIN))).rejects.toThrow(error);
    const rows = await staff.query(api.musicRequests.myRequests, {});
    expect(rows.map((row) => [row.status, row.requestComment])).toEqual([["PENDING", undefined]]);
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

  test("removes and re-adds a Praise Manager whose email was stored with capitals", async () => {
    const t = await setup();
    const admin = asUser(t, ADMIN);
    const stored = "Music.Staff@SOW.org.au";
    const settingsFor = () =>
      t.run(async (ctx) =>
        ctx.db
          .query("yearSettings")
          .withIndex("by_year", (q) => q.eq("year", YEAR))
          .first(),
      );
    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      if (settings) {
        await ctx.db.patch(settings._id, { praiseManagerEmails: [stored] });
      } else {
        await ctx.db.insert("yearSettings", {
          year: YEAR,
          praiseManagerEmails: [stored],
        });
      }
    });

    await admin.mutation(api.admin.addPraiseManager, {
      year: YEAR,
      email: STAFF,
    });
    expect((await settingsFor())?.praiseManagerEmails).toEqual([STAFF]);

    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      await ctx.db.patch(settings!._id, { praiseManagerEmails: [stored] });
    });
    await admin.mutation(api.admin.removePraiseManager, {
      year: YEAR,
      email: STAFF,
    });
    expect((await settingsFor())?.praiseManagerEmails).toEqual([]);

    await t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      await ctx.db.patch(settings!._id, { praiseManagerEmails: [stored] });
    });
    await admin.mutation(api.admin.removeStaffProfile, {
      year: YEAR,
      email: STAFF,
    });
    expect((await settingsFor())?.praiseManagerEmails).toEqual([]);
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
    t: T,
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
      'Hana Doe requested "Fourth"',
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

});

describe("Praise List review follow-up", () => {
  const scheduledPushes = (t: T) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name === "push:send")
        .map((job) => job.args[0] as { to: string; title: string }),
    );

  const scheduledEmails = (t: T) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name === "emails:send")
        .map(
          (job) =>
            job.args[0] as { to: string; subject: string; body: string },
        ),
    );

  const nameStaff = (t: T, name: string) =>
    t.run(async (ctx) => {
      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) =>
          q.eq("email", STAFF).eq("year", YEAR),
        )
        .first();
      await ctx.db.patch(profile!._id, { name });
    });

  const setPraiseManagers = (t: T, emails: string[]) =>
    t.run(async (ctx) => {
      const settings = await ctx.db
        .query("yearSettings")
        .withIndex("by_year", (q) => q.eq("year", YEAR))
        .first();
      await ctx.db.patch(settings!._id, { praiseManagerEmails: emails });
    });

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
    expect(await scheduledEmails(t)).toEqual([]);
  });

  test("each Praise Manager is emailed the song and a link to To review", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    await setPraiseManagers(t, [ADMIN, " Second.Manager@sow.org.au "]);
    await nameStaff(t, "Hana Doe");
    await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      ...song({ title: "Way  Maker", artist: "Sinach" }),
      requestComment: "For the Easter weekly",
    });

    const body = [
      'Hana Doe requested "Way Maker"',
      "",
      "Title: Way Maker",
      "Artist: Sinach",
      `Link: ${SPOTIFY}`,
      "",
      `Requested by: Hana Doe (${STAFF})`,
      "Note: For the Easter weekly",
      "",
      "Open in THE SHED: https://theshed.sow.org.au/music?tab=review",
    ].join("\n");
    expect(await scheduledEmails(t)).toEqual([
      { to: ADMIN, subject: "New music request: Way Maker", body },
      {
        to: "second.manager@sow.org.au",
        subject: "New music request: Way Maker",
        body,
      },
    ]);
    expect(await scheduledPushes(t)).toEqual([
      expect.objectContaining({
        to: ADMIN,
        title: "New music request",
        body: 'Hana Doe requested "Way Maker"',
      }),
      expect.objectContaining({
        to: "second.manager@sow.org.au",
        title: "New music request",
      }),
    ]);
  });

  test("a batch of songs is one email listing them all", async () => {
    const t = await setup();
    await assignPraiseManager(t);
    await asUser(t, STAFF).mutation(api.musicRequests.submitMany, {
      songs: [
        song({ title: "First", link: "https://example.com/first" }),
        song({ title: "Second", artist: "Band", link: "https://example.com/second" }),
      ],
    });

    expect(await scheduledEmails(t)).toEqual([
      {
        to: ADMIN,
        subject: "2 new music requests",
        body: [
          `${STAFF} requested 2 songs.`,
          "",
          '1. "First" by Test Artist',
          "   https://example.com/first",
          '2. "Second" by Band',
          "   https://example.com/second",
          "",
          `Requested by: ${STAFF}`,
          "",
          "Open in THE SHED: https://theshed.sow.org.au/music?tab=review",
        ].join("\n"),
      },
    ]);
  });

  test("a Praise Manager without a role this year isn't emailed their own song", async () => {
    const t = await setup();
    await t.run((ctx) =>
      ctx.db.insert("yearSettings", {
        year: YEAR + 1,
        praiseManagerEmails: ["second.manager@sow.org.au", STAFF.toUpperCase()],
      }),
    );
    vi.setSystemTime(staffYearStartMs(YEAR + 1) + 10 * 86_400_000);
    await asUser(t, STAFF).mutation(api.musicRequests.submit, song());

    expect((await scheduledEmails(t)).map((email) => email.to)).toEqual([
      "second.manager@sow.org.au",
    ]);
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
