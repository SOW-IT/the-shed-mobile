/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { staffYearForDate, staffYearStartMs } from "../shared/flow";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const YEAR = staffYearForDate(new Date());
const PINNED_NOW = staffYearStartMs(YEAR) + 150 * 86_400_000;

const ADMIN = "admin@sow.org.au";
const MANAGER = "music.manager@sow.org.au";
const STAFF = "music.staff@sow.org.au";
const OTHER = "music.other@sow.org.au";
const LEFT = "music.left@sow.org.au";

const asUser = (t: TestConvex<typeof schema>, email: string) =>
  t.withIdentity({ email, subject: email, issuer: "test" });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const page = (numItems: number, cursor: string | null = null) => ({ numItems, cursor });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function setup() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.admin.seed, { adminEmail: ADMIN });
  const admin = asUser(t, ADMIN);
  await admin.mutation(api.admin.upsertDepartment, {
    year: YEAR,
    name: "Music",
    division: "Engagement",
    headEmail: ADMIN,
  });
  for (const email of [MANAGER, STAFF, OTHER]) {
    await admin.mutation(api.admin.setStaffProfile, {
      year: YEAR,
      email,
      roles: ["Staff"],
      department: "Music",
    });
  }
  await t.run(async (ctx) => {
    await ctx.db.insert("yearSettings", { year: YEAR, praiseManagerEmails: [MANAGER, LEFT] });
  });
  return t;
}

const track = (id: string) => `https://open.spotify.com/track/${id}`;

async function addApproved(
  t: TestConvex<typeof schema>,
  title: string,
  artist: string,
  link: string,
  at: number,
) {
  vi.setSystemTime(at);
  return await asUser(t, MANAGER).mutation(api.musicRequests.submit, { title, artist, link });
}

describe("approvedPage", () => {
  test("sorts by name, artist, approval time and release date, a page at a time", async () => {
    const t = await setup();
    const amazing = await addApproved(t, "Amazing Grace", "Zed Band", track("a1"), PINNED_NOW + 1000);
    const cornerstone = await addApproved(t, "Cornerstone", "Hillsong", track("c3"), PINNED_NOW + 2000);
    const build = await addApproved(t, "build my life", "Pat Barrett", "https://example.com/build", PINNED_NOW + 3000);
    await t.run(async (ctx) => {
      await ctx.db.patch("musicRequests", amazing, { releaseDate: "2014-03" });
      await ctx.db.patch("musicRequests", cornerstone, { releaseDate: "2012-07-10" });
    });
    const titles = async (sort: "title-asc" | "title-desc" | "artist-asc" | "artist-desc" | "approved-desc" | "release-desc") =>
      (await asUser(t, OTHER).query(api.musicRequests.approvedPage, { paginationOpts: page(10), sort }))!.page.map(
        (row) => row.title,
      );

    expect(await titles("title-asc")).toEqual(["Amazing Grace", "build my life", "Cornerstone"]);
    expect(await titles("title-desc")).toEqual(["Cornerstone", "build my life", "Amazing Grace"]);
    expect(await titles("artist-asc")).toEqual(["Cornerstone", "build my life", "Amazing Grace"]);
    expect(await titles("artist-desc")).toEqual(["Amazing Grace", "build my life", "Cornerstone"]);
    expect(await titles("approved-desc")).toEqual(["build my life", "Cornerstone", "Amazing Grace"]);
    expect(await titles("release-desc")).toEqual(["Amazing Grace", "Cornerstone", "build my life"]);

    const first = (await asUser(t, OTHER).query(api.musicRequests.approvedPage, {
      paginationOpts: page(2),
      sort: "title-asc",
    }))!;
    expect(first.page.map((row) => row._id)).toEqual([amazing, build]);
    expect(first.isDone).toBe(false);
    const second = (await asUser(t, OTHER).query(api.musicRequests.approvedPage, {
      paginationOpts: page(2, first.continueCursor),
      sort: "title-asc",
    }))!;
    expect(second.page.map((row) => row._id)).toEqual([cornerstone]);
    expect(second.isDone).toBe(true);
  });

  test("searches titles and artists, and caps a page at 50", async () => {
    const t = await setup();
    for (let i = 0; i < 52; i++) {
      await addApproved(t, `Song ${i}`, "Filler", `https://example.com/${i}`, PINNED_NOW + i);
    }
    await addApproved(t, "Morning Light", "Hana Doe", track("m1"), PINNED_NOW + 100);
    const search = (text: string) =>
      asUser(t, OTHER).query(api.musicRequests.approvedPage, {
        paginationOpts: page(10),
        sort: "title-asc",
        search: text,
      });
    expect((await search("morning"))!.page.map((row) => row.title)).toEqual(["Morning Light"]);
    expect((await search("hana"))!.page.map((row) => row.title)).toEqual(["Morning Light"]);
    expect((await search("   "))!.page).toHaveLength(10);
    const huge = await asUser(t, OTHER).query(api.musicRequests.approvedPage, {
      paginationOpts: page(500),
      sort: "approved-desc",
    });
    expect(huge!.page).toHaveLength(50);
    expect(await t.query(api.musicRequests.approvedPage, { paginationOpts: page(5), sort: "title-asc" })).toBeNull();
  });

  test("everyone sees who suggested a song; only Praise Managers, admins and the requester see the note", async () => {
    const t = await setup();
    await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Noted Song",
      artist: "Band",
      link: track("n1"),
      requestComment: "For the Easter weekly",
    });
    const [pending] = (await asUser(t, MANAGER).query(api.musicRequests.reviewPage, {
      paginationOpts: page(5),
      status: "PENDING",
    }))!.page;
    await asUser(t, MANAGER).mutation(api.musicRequests.approve, { requestId: pending._id });

    const seen = async (email: string) =>
      (await asUser(t, email).query(api.musicRequests.approvedPage, { paginationOpts: page(5), sort: "title-asc" }))!
        .page[0];
    const other = await seen(OTHER);
    expect(other.requesterEmail).toBe(STAFF);
    expect(other.requestComment).toBeUndefined();
    for (const email of [STAFF, MANAGER, ADMIN]) {
      expect((await seen(email)).requestComment).toBe("For the Easter weekly");
    }
    const [legacy] = await asUser(t, OTHER).query(api.musicRequests.approved, {});
    expect(legacy.requesterEmail).toBe(STAFF);
    expect(legacy.requestComment).toBeUndefined();
  });
});

describe("myRequestsPage and reviewPage", () => {
  test("Mine pages through the caller's own songs, all or by status", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    vi.setSystemTime(PINNED_NOW + 1000);
    const first = await staff.mutation(api.musicRequests.submit, {
      title: "One",
      artist: "A",
      link: "https://example.com/one",
    });
    vi.setSystemTime(PINNED_NOW + 2000);
    const second = await staff.mutation(api.musicRequests.submit, {
      title: "Two",
      artist: "A",
      link: "https://example.com/two",
    });
    await asUser(t, MANAGER).mutation(api.musicRequests.decline, { requestId: first, reason: "Not now" });
    const mine = (status?: "PENDING" | "APPROVED" | "DECLINED") =>
      staff.query(api.musicRequests.myRequestsPage, { paginationOpts: page(10), status });

    expect((await mine())!.page.map((row) => row._id)).toEqual([second, first]);
    expect((await mine("DECLINED"))!.page).toMatchObject([{ _id: first, declineComment: "Not now" }]);
    expect((await mine("APPROVED"))!.page).toEqual([]);
    expect(
      (await asUser(t, OTHER).query(api.musicRequests.myRequestsPage, { paginationOpts: page(10) }))!.page,
    ).toEqual([]);
    expect(await t.query(api.musicRequests.myRequestsPage, { paginationOpts: page(10) })).toBeNull();
  });

  test("To review pages pending and declined songs for Praise Managers only", async () => {
    const t = await setup();
    const staff = asUser(t, STAFF);
    const keep = await staff.mutation(api.musicRequests.submit, {
      title: "Keep",
      artist: "A",
      link: "https://example.com/keep",
    });
    const drop = await staff.mutation(api.musicRequests.submit, {
      title: "Drop",
      artist: "A",
      link: "https://example.com/drop",
    });
    await asUser(t, MANAGER).mutation(api.musicRequests.decline, { requestId: drop });
    const review = (email: string, status: "PENDING" | "DECLINED") =>
      asUser(t, email).query(api.musicRequests.reviewPage, { paginationOpts: page(10), status });

    expect((await review(MANAGER, "PENDING"))!.page.map((row) => row._id)).toEqual([keep]);
    expect((await review(MANAGER, "DECLINED"))!.page.map((row) => row._id)).toEqual([drop]);
    expect(await review(OTHER, "PENDING")).toBeNull();
    expect(await t.query(api.musicRequests.reviewPage, { paginationOpts: page(10), status: "PENDING" })).toBeNull();
  });
});

describe("a note per song", () => {
  test("each song in a batch keeps its own note, and the email lists them", async () => {
    const t = await setup();
    await asUser(t, STAFF).mutation(api.musicRequests.submitMany, {
      songs: [
        { title: "First", artist: "A", link: "https://example.com/first", requestComment: "Opener" },
        { title: "Second", artist: "B", link: "https://example.com/second" },
        { title: "Third", artist: "C", link: "https://example.com/third", requestComment: "  Closer \n song " },
      ],
    });
    const notes = await t.run(async (ctx) =>
      Object.fromEntries(
        (await ctx.db.query("musicRequests").collect()).map((row) => [row.title, row.requestComment ?? null]),
      ),
    );
    expect(notes).toEqual({ First: "Opener", Second: null, Third: "Closer \n song" });
    const [email] = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect())
        .filter((job) => job.name === "emails:send")
        .map((job) => job.args[0] as { body: string }),
    );
    expect(email.body).toContain(
      [
        '1. "First" by A',
        "   https://example.com/first",
        "   Note: Opener",
        '2. "Second" by B',
        "   https://example.com/second",
        '3. "Third" by C',
        "   https://example.com/third",
        "   Note: Closer song",
      ].join("\n"),
    );
    expect(email.body).not.toMatch(/^Note:/m);
  });

  test("a note for the whole batch from an older app still lands on each song without one", async () => {
    const t = await setup();
    await asUser(t, STAFF).mutation(api.musicRequests.submitMany, {
      songs: [
        { title: "Own", artist: "A", link: "https://example.com/own", requestComment: "Mine" },
        { title: "Shared", artist: "A", link: "https://example.com/shared" },
        { title: "Blank", artist: "A", link: "https://example.com/blank", requestComment: "  " },
      ],
      requestComment: "For the weekly",
    });
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query("musicRequests").collect()).map((row) => row.requestComment),
    );
    expect(notes.sort()).toEqual(["For the weekly", "For the weekly", "Mine"]);
    await expect(
      asUser(t, STAFF).mutation(api.musicRequests.submitMany, {
        songs: [{ title: "Long", artist: "A", link: "https://example.com/long", requestComment: "x".repeat(2001) }],
      }),
    ).rejects.toThrow("Request comment must be 2000 characters or fewer.");
    expect(
      await asUser(t, STAFF).mutation(api.musicRequests.previewBatch, {
        songs: [{ title: "Preview", artist: "A", link: "https://example.com/preview", requestComment: "Hi" }],
      }),
    ).toEqual({ exactDuplicates: 0, possibleDuplicates: 0 });
  });
});

describe("praiseManagers", () => {
  test("lists this year's Praise Managers who are on staff, by name", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("directoryUsers", { email: MANAGER, name: "Mia Manager" });
    });
    expect(await asUser(t, STAFF).query(api.musicRequests.praiseManagers, {})).toEqual([
      { email: MANAGER, name: "Mia Manager" },
    ]);
    expect(await t.query(api.musicRequests.praiseManagers, {})).toBeNull();
  });
});

describe("release dates", () => {
  const stubSpotify = () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(PINNED_NOW);
  });

  const runScheduled = (t: TestConvex<typeof schema>) =>
    t.finishAllScheduledFunctions(vi.runAllTimers);

  const releaseDateOf = (t: TestConvex<typeof schema>, id: Id<"musicRequests">) =>
    t.run(async (ctx) => (await ctx.db.get("musicRequests", id))?.releaseDate ?? null);

  test("a Spotify song gets its album's release date after it's saved", async () => {
    const t = await setup();
    stubSpotify();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("accounts.spotify.com")
        ? json({ access_token: "token" })
        : url.includes("api.spotify.com")
          ? json({ album: { release_date: "2019-02-01", images: [] } })
          : json({}),
    );
    const id = await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Dated",
      artist: "A",
      link: track("d1"),
    });
    await runScheduled(t);
    expect(await releaseDateOf(t, id)).toBe("2019-02-01");
    expect(fetchMock.mock.calls.map((call) => call[0])).toContain("https://api.spotify.com/v1/tracks/d1");
  });

  test("batches, edits and the backfill look release dates up too", async () => {
    const t = await setup();
    stubSpotify();
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("accounts.spotify.com")
        ? json({ access_token: "token" })
        : url.includes("api.spotify.com")
          ? json({ album: { release_date: url.endsWith("e2") ? "2001" : "2020-05", images: [] } })
          : json({}),
    );
    await asUser(t, STAFF).mutation(api.musicRequests.submitMany, {
      songs: [{ title: "Batch", artist: "A", link: track("b1") }],
    });
    const plain = await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Was YouTube",
      artist: "A",
      link: "https://www.youtube.com/watch?v=abcdefghijk",
    });
    await asUser(t, STAFF).mutation(api.musicRequests.update, {
      requestId: plain,
      title: "Was YouTube",
      artist: "A",
      link: track("e2"),
    });
    const legacy = await t.run((ctx) =>
      ctx.db.insert("musicRequests", {
        requesterEmail: STAFF,
        title: "Old Row",
        artist: "A",
        link: track("o3"),
        status: "APPROVED",
      }),
    );
    expect(await t.mutation(internal.musicBackfill.backfill, {})).toMatchObject({ updated: 1 });
    await runScheduled(t);
    expect(await releaseDateOf(t, plain)).toBe("2001");
    expect(await releaseDateOf(t, legacy)).toBe("2020-05");
    const row = await t.run((ctx) => ctx.db.get("musicRequests", legacy));
    expect(row).toMatchObject({ titleSort: "old row", artistSort: "a", searchText: "Old Row A" });
    const [batch] = await t.run((ctx) =>
      ctx.db.query("musicRequests").withIndex("by_spotify_track_id", (q) => q.eq("spotifyTrackId", "b1")).collect(),
    );
    expect(batch.releaseDate).toBe("2020-05");
  });

  test("the backfill's next page waits until this page's lookups are spaced out", async () => {
    const t = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 101; i++) {
        await ctx.db.insert("musicRequests", {
          requesterEmail: STAFF,
          title: `Old ${i}`,
          artist: "A",
          link: track(`old${i}`),
          status: "APPROVED",
        });
      }
    });
    await t.mutation(internal.musicBackfill.backfill, {});
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const fills = jobs.filter((job) => job.name === "musicReleaseDates:fill");
    const [nextPage] = jobs.filter((job) => job.name === "musicBackfill:backfill");
    expect(fills).toHaveLength(100);
    const times = fills.map((job) => job.scheduledTime);
    expect(nextPage.scheduledTime).toBeGreaterThan(Math.max(...times));
    expect(nextPage.scheduledTime - Math.min(...times)).toBe(100 * 250);
  });

  test("an edit to another recording drops the old date; an edit keeping it doesn't look again", async () => {
    const t = await setup();
    const id = await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Edit Me",
      artist: "A",
      link: track("k1"),
    });
    await t.run((ctx) => ctx.db.patch("musicRequests", id, { releaseDate: "1999" }));
    const scheduledFills = () =>
      t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === "musicReleaseDates:fill",
        ).length,
      );
    const before = await scheduledFills();
    await asUser(t, STAFF).mutation(api.musicRequests.update, {
      requestId: id,
      title: "Edit Me Again",
      artist: "A",
      link: track("k1"),
    });
    expect(await scheduledFills()).toBe(before);
    expect(await releaseDateOf(t, id)).toBe("1999");
    await asUser(t, STAFF).mutation(api.musicRequests.update, {
      requestId: id,
      title: "Edit Me Again",
      artist: "A",
      link: "https://example.com/elsewhere",
    });
    expect(await releaseDateOf(t, id)).toBeNull();
  });

  test("a failed lookup, a missing date or a changed song leaves the row alone", async () => {
    const t = await setup();
    const id = await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Quiet",
      artist: "A",
      link: track("q1"),
    });
    await t.action(internal.musicReleaseDates.fill, { requestId: id });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    stubSpotify();
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await t.action(internal.musicReleaseDates.fill, { requestId: id });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("No release date for q1"));
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(json({ album: { images: [] } }));
    await t.action(internal.musicReleaseDates.fill, { requestId: id });
    expect(await releaseDateOf(t, id)).toBeNull();
    await t.mutation(internal.musicReleaseDates.save, {
      requestId: id,
      spotifyTrackId: "another",
      releaseDate: "2000",
    });
    expect(await releaseDateOf(t, id)).toBeNull();
    const youtube = await asUser(t, STAFF).mutation(api.musicRequests.submit, {
      title: "Video",
      artist: "A",
      link: "https://www.youtube.com/watch?v=zyxwvutsrqp",
    });
    expect(await t.action(internal.musicReleaseDates.fill, { requestId: youtube })).toBeNull();
  });
});
