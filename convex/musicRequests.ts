import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { seesThrough, waitsThrough, type Lens } from "../shared/actingAs";
import { SONGS_COUNTED } from "../shared/praiseList";
import { lensFor, viewsAsAdmin } from "./actingAs";
import {
  type CallerContext,
  currentStaffYear,
  displayName,
  getProfile,
  memoAsync,
  optionalProfile,
  requireProfile,
  resolveName,
} from "./model";
import { notify as notifyPerson } from "./requests";
import {
  songArtworkUrl,
  spotifyTrackId,
  youtubeVideoId,
} from "./shared/musicLinks";

/** Get Praise Manager emails for the active staff year. */
async function praiseManagerEmailsForYear(
  ctx: MusicCtx,
  year: number,
): Promise<string[]> {
  const settings = await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q) => q.eq("year", year))
    .first();
  return settings?.praiseManagerEmails ?? [];
}

/** Check whether the caller is an assigned Praise Manager. */
async function callerIsPraiseManager(
  ctx: MusicCtx,
  caller: CallerContext,
): Promise<boolean> {
  const year = currentStaffYear();
  if (caller.profile.year !== year) return false;
  const managers = await praiseManagerEmailsForYear(ctx, year);

  return managers.some(
    (managerEmail) => managerEmail.toLowerCase() === caller.email.toLowerCase(),
  );
}

/**
 * Whether the caller sees the review queue. Like every view, it follows the
 * role an admin is acting as; approving and declining still need a real
 * Praise Manager.
 */
async function seesReviewQueue(
  ctx: MusicCtx,
  caller: Awaited<ReturnType<typeof requireProfile>>,
): Promise<boolean> {
  return await seesThrough(
    await lensFor(ctx, caller),
    () => callerIsPraiseManager(ctx, caller),
    (persona) => persona.role === "praiseManager",
  );
}

function nameResolver(ctx: MusicCtx) {
  return memoAsync((email: string) => resolveName(ctx, email, currentStaffYear()));
}

async function withNames(ctx: MusicCtx, rows: MusicRequestRow[]) {
  const nameOf = nameResolver(ctx);
  return await Promise.all(
    rows.map(async (row) => ({
      ...row,
      requesterName: await nameOf(row.requesterEmail),
      reviewerName: row.reviewedByEmail
        ? await nameOf(row.reviewedByEmail)
        : null,
    })),
  );
}

/** Create in-app notifications. */
async function notify(
  ctx: MutationCtx,
  emails: string[],
  title: string,
  body: string,
  url: string,
  actor?: string,
) {
  for (const to of new Set(emails.map((email) => email.toLowerCase()))) {
    await notifyPerson(ctx, {
      to,
      actor,
      subject: title,
      body: body.replace(/\s+/g, " ").trim(),
      url,
      email: false,
    });
  }
}

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

async function tellPraiseManagers(
  ctx: MutationCtx,
  requesterEmail: string,
  songs: { title: string; artist: string; link: string; requestComment?: string }[],
) {
  const year = currentStaffYear();
  const requester = requesterEmail.toLowerCase();
  const managers = new Set(
    (await praiseManagerEmailsForYear(ctx, year))
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email && email !== requester),
  );
  if (!managers.size) return;
  const name = await displayName(ctx, requesterEmail, year);
  const [first] = songs;
  const single = songs.length === 1;
  const lead = single
    ? `${name} requested "${oneLine(first.title)}"`
    : `${name} requested ${songs.length} songs.`;
  const songLines = single
    ? [
        `Title: ${oneLine(first.title)}`,
        `Artist: ${oneLine(first.artist)}`,
        `Link: ${first.link}`,
      ]
    : songs.flatMap((song, i) => [
        `${i + 1}. "${oneLine(song.title)}" by ${oneLine(song.artist)}`,
        `   ${song.link}`,
        ...(song.requestComment ? [`   Note: ${oneLine(song.requestComment)}`] : []),
      ]);
  const singleNote = single ? first.requestComment : undefined;
  const body = [
    oneLine(lead),
    "",
    ...songLines,
    "",
    `Requested by: ${name === requesterEmail ? name : `${name} (${requesterEmail})`}`,
    ...(singleNote ? [`Note: ${oneLine(singleNote)}`] : []),
  ].join("\n");
  for (const to of managers) {
    await notifyPerson(ctx, {
      to,
      actor: requesterEmail,
      subject: single
        ? `New music request: ${oneLine(first.title)}`
        : `${songs.length} new music requests`,
      pushTitle: single ? "New music request" : "New music requests",
      body,
      url: "/music?tab=review",
    });
  }
}

type MusicRequestRow = Doc<"musicRequests">;
/** Normalized song metadata is used only for a possible-duplicate warning. */
function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizedSongKey(title: string, artist: string): string {
  return JSON.stringify([normalized(title), normalized(artist)]);
}

export function songKeys(song: {
  link: string;
  title: string;
  artist: string;
}) {
  return {
    spotifyTrackId: spotifyTrackId(song.link) ?? undefined,
    youtubeVideoId: youtubeVideoId(song.link) ?? undefined,
    normalizedSongKey: normalizedSongKey(song.title, song.artist),
    titleSort: normalized(song.title),
    artistSort: normalized(song.artist),
    searchText: `${song.title} ${song.artist}`,
  };
}

async function fetchReleaseDateLater(
  ctx: MutationCtx,
  requestId: Id<"musicRequests">,
  spotifyTrack: string | undefined,
) {
  if (spotifyTrack) {
    await ctx.scheduler.runAfter(0, internal.musicReleaseDates.fill, { requestId });
  }
}

function duplicateKind(
  row: MusicRequestRow,
  song: { link: string; title: string; artist: string; isrc?: string },
): "exact" | "possible" | null {
  const incomingId = spotifyTrackId(song.link);
  const existingId = spotifyTrackId(row.link);
  if (incomingId && existingId && incomingId === existingId) return "exact";
  const incomingVideo = youtubeVideoId(song.link);
  if (incomingVideo && incomingVideo === youtubeVideoId(row.link))
    return "exact";
  if (
    song.isrc &&
    row.isrc &&
    song.isrc.toUpperCase() === row.isrc.toUpperCase()
  )
    return "exact";
  if (
    normalized(row.title) === normalized(song.title) &&
    normalized(row.artist) === normalized(song.artist)
  )
    return "possible";
  return null;
}

type Duplicate = { row: MusicRequestRow; kind: "exact" | "possible" };

function preferredDuplicate(
  rows: MusicRequestRow[],
  song: { link: string; title: string; artist: string; isrc?: string },
  excludeId?: string,
): Duplicate | null {
  const matches = rows
    .filter((row) => row._id !== excludeId)
    .map((row) => ({ row, kind: duplicateKind(row, song) }))
    .filter(
      (entry): entry is Duplicate => entry.kind !== null,
    );
  const statusRank = { APPROVED: 0, PENDING: 1, DECLINED: 2 };
  matches.sort(
    (a, b) =>
      (a.kind === "exact" ? 0 : 1) - (b.kind === "exact" ? 0 : 1) ||
      statusRank[a.row.status] - statusRank[b.row.status],
  );
  return matches[0] ?? null;
}

type MusicCtx = QueryCtx | MutationCtx;

type SongInput = {
  link: string;
  title: string;
  artist: string;
  isrc?: string;
};

async function indexedMatches(
  ctx: MusicCtx,
  song: SongInput,
  excludeId?: string,
) {
  const trackId = spotifyTrackId(song.link);
  const videoId = youtubeVideoId(song.link);
  const isrc = song.isrc?.trim().toUpperCase();
  const songKey = normalizedSongKey(song.title, song.artist);

  const [spotifyMatches, videoMatches, isrcMatches, titleMatches] =
    await Promise.all([
      trackId
        ? ctx.db
            .query("musicRequests")
            .withIndex("by_spotify_track_id", (q) =>
              q.eq("spotifyTrackId", trackId),
            )
            .collect()
        : Promise.resolve([]),

      videoId
        ? ctx.db
            .query("musicRequests")
            .withIndex("by_youtube_video_id", (q) =>
              q.eq("youtubeVideoId", videoId),
            )
            .collect()
        : Promise.resolve([]),

      isrc
        ? ctx.db
            .query("musicRequests")
            .withIndex("by_isrc", (q) => q.eq("isrc", isrc))
            .collect()
        : Promise.resolve([]),

      ctx.db
        .query("musicRequests")
        .withIndex("by_normalized_song_key", (q) =>
          q.eq("normalizedSongKey", songKey),
        )
        .collect(),
    ]);

  const matches = new Map<string, MusicRequestRow>();

  for (const row of [
    ...spotifyMatches,
    ...videoMatches,
    ...isrcMatches,
    ...titleMatches,
  ]) {
    matches.set(row._id, row);
  }

  return [...matches.values()].filter((row) => row._id !== excludeId);
}

const isDeclined = (row: MusicRequestRow) => row.status === "DECLINED";

async function findIndexedDuplicate(
  ctx: MusicCtx,
  song: SongInput,
  excludeId?: string,
) {
  const rows = await indexedMatches(ctx, song, excludeId);
  return preferredDuplicate(
    rows.filter((row) => !isDeclined(row)),
    song,
  );
}

function validateSong(song: {
  title: string;
  artist: string;
  link: string;
  isrc?: string;
}) {
  const title = song.title.trim();
  const artist = song.artist.trim();
  const link = song.link.trim();
  if (!title || !artist || !link)
    throw new ConvexError("Every song needs a title, artist and link.");
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(link);
  } catch {
    throw new ConvexError("Please enter a valid music link.");
  }

  if (
    !["https:", "http:"].includes(parsedUrl.protocol) ||
    !parsedUrl.hostname ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new ConvexError("Please enter a valid HTTP or HTTPS music link.");
  }
  const isrc = song.isrc?.trim().toUpperCase() || undefined;
  if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc))
    throw new ConvexError("Invalid ISRC format.");
  if (title.length > 200) {
    throw new ConvexError("Song title must be 200 characters or fewer.");
  }

  if (artist.length > 200) {
    throw new ConvexError("Artist name must be 200 characters or fewer.");
  }

  if (link.length > 2048) {
    throw new ConvexError("Music link must be 2048 characters or fewer.");
  }
  return { title, artist, link, isrc };
}

const MAX_COMMENT_LENGTH = 2000;

function cleanComment(
  value: string | undefined,
  fieldName: string,
): string | undefined {
  const comment = value?.trim();

  if (!comment) return undefined;

  if (comment.length > MAX_COMMENT_LENGTH) {
    throw new ConvexError(
      `${fieldName} must be ${MAX_COMMENT_LENGTH} characters or fewer.`,
    );
  }

  return comment;
}

/** Returns exact or possible duplicates; retains title/artist/status for existing UI. */
export const checkDuplicate = query({
  args: {
    link: v.string(),
    title: v.optional(v.string()),
    artist: v.optional(v.string()),
    isrc: v.optional(v.string()),
    // The request being edited, so it doesn't match itself.
    excludeId: v.optional(v.id("musicRequests")),
  },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    const song = {
      link: args.link,
      title: args.title ?? "",
      artist: args.artist ?? "",
      isrc: args.isrc,
    };
    const rows = await indexedMatches(ctx, song, args.excludeId);
    const describe = (row: MusicRequestRow) => ({
      title: row.title,
      artist: row.artist,
      status: row.status,
      albumArtUrl: row.albumArtUrl,
    });
    const live = preferredDuplicate(
      rows.filter((row) => !isDeclined(row)),
      song,
    );
    if (live) return { ...describe(live.row), kind: live.kind };
    const declined = preferredDuplicate(rows.filter(isDeclined), song);
    if (!declined) return null;
    return {
      ...describe(declined.row),
      kind: "declined" as const,
      sameRecording: declined.kind === "exact",
    };
  },
});

/** Submit a song. Possible duplicates require an explicit user confirmation. */
export const submit = mutation({
  args: {
    title: v.string(),
    artist: v.string(),
    link: v.string(),
    requestComment: v.optional(v.string()),
    albumArtUrl: v.optional(v.string()),
    isrc: v.optional(v.string()),
    allowPossibleDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const song = validateSong(args);
    const requestComment = cleanComment(args.requestComment, "Request comment");
    const duplicate = await findIndexedDuplicate(ctx, song);
    if (duplicate?.kind === "exact")
      throw new ConvexError(
        `This recording was already requested (${duplicate.row.status.toLowerCase()}).`,
      );
    if (duplicate?.kind === "possible" && !args.allowPossibleDuplicate)
      throw new ConvexError(
        "Possible duplicate: confirm that you want to request this version anyway.",
      );

    const isPraiseManager = await callerIsPraiseManager(ctx, caller);
    const id = await ctx.db.insert("musicRequests", {
      requesterEmail: caller.email,
      ...song,
      ...songKeys(song),
      requestComment,
      albumArtUrl: songArtworkUrl(song.link, args.albumArtUrl?.trim()),
      status: isPraiseManager ? "APPROVED" : "PENDING",
      ...(isPraiseManager
        ? { reviewedByEmail: caller.email, reviewedTime: Date.now() }
        : {}),
    });
    await fetchReleaseDateLater(ctx, id, spotifyTrackId(song.link) ?? undefined);
    if (!isPraiseManager)
      await tellPraiseManagers(ctx, caller.email, [{ ...song, requestComment }]);
    return id;
  },
});

/** Preview duplicates without inserting any requests. */
export const previewBatch = mutation({
  args: {
    songs: v.array(
      v.object({
        title: v.string(),
        artist: v.string(),
        link: v.string(),
        albumArtUrl: v.optional(v.string()),
        isrc: v.optional(v.string()),
        requestComment: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    if (!args.songs.length || args.songs.length > 50)
      throw new ConvexError("Add between 1 and 50 songs.");
    const batchSongs: MusicRequestRow[] = [];
    const databaseDuplicateCache = new Map<
      string,
      Awaited<ReturnType<typeof findIndexedDuplicate>>
    >();
    let exactDuplicates = 0;
    let possibleDuplicates = 0;
    for (const raw of args.songs) {
      const song = validateSong(raw);
      // Reuse database results for identical inputs within this preview only.
      // Still compare against earlier entries in the batch on every iteration.
      const keys = songKeys(song);
      const cacheKey = JSON.stringify([
        keys.spotifyTrackId ?? null,
        keys.youtubeVideoId ?? null,
        song.isrc ?? null,
        keys.normalizedSongKey,
      ]);
      let databaseDuplicate = databaseDuplicateCache.get(cacheKey);
      if (!databaseDuplicateCache.has(cacheKey)) {
        databaseDuplicate = await findIndexedDuplicate(ctx, song);
        databaseDuplicateCache.set(cacheKey, databaseDuplicate);
      }
      const batchDuplicate = preferredDuplicate(batchSongs, song);

      const duplicate =
        databaseDuplicate?.kind === "exact"
          ? databaseDuplicate
          : batchDuplicate?.kind === "exact"
            ? batchDuplicate
            : (databaseDuplicate ?? batchDuplicate);
      if (duplicate?.kind === "exact") exactDuplicates++;
      else if (duplicate?.kind === "possible") possibleDuplicates++;
      // Include songs in this batch when checking subsequent entries.
      batchSongs.push({
        ...song,
        _id: `preview-${batchSongs.length}`,
        status: "PENDING",
      } as MusicRequestRow);
    }
    return { exactDuplicates, possibleDuplicates };
  },
});

/** Batch submission: exact and unconfirmed possible duplicates are skipped. */
export const submitMany = mutation({
  args: {
    songs: v.array(
      v.object({
        title: v.string(),
        artist: v.string(),
        link: v.string(),
        albumArtUrl: v.optional(v.string()),
        isrc: v.optional(v.string()),
        requestComment: v.optional(v.string()),
      }),
    ),
    requestComment: v.optional(v.string()),
    allowPossibleDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (!args.songs.length || args.songs.length > 50)
      throw new ConvexError("Add between 1 and 50 songs.");
    const batchNote = cleanComment(args.requestComment, "Request comment");
    const notes = args.songs.map(
      (raw) => cleanComment(raw.requestComment, "Request comment") ?? batchNote,
    );
    const isPraiseManager = await callerIsPraiseManager(ctx, caller);
    const added: (ReturnType<typeof validateSong> & { requestComment?: string })[] = [];
    let skipped = 0;
    let possibleDuplicates = 0;
    for (const [index, raw] of args.songs.entries()) {
      const song = validateSong(raw);
      const requestComment = notes[index];
      const duplicate = await findIndexedDuplicate(ctx, song);
      if (duplicate?.kind === "exact") {
        skipped++;
        continue;
      }
      if (duplicate?.kind === "possible" && !args.allowPossibleDuplicates) {
        skipped++;
        possibleDuplicates++;
        continue;
      }
      const keys = songKeys(song);
      const id = await ctx.db.insert("musicRequests", {
        requesterEmail: caller.email,
        ...song,
        ...keys,
        albumArtUrl: songArtworkUrl(song.link, raw.albumArtUrl?.trim()),
        requestComment,
        status: isPraiseManager ? "APPROVED" : "PENDING",
        ...(isPraiseManager
          ? { reviewedByEmail: caller.email, reviewedTime: Date.now() }
          : {}),
      });
      await fetchReleaseDateLater(ctx, id, keys.spotifyTrackId);
      added.push({ ...song, requestComment });
    }
    if (!isPraiseManager && added.length)
      await tellPraiseManagers(ctx, caller.email, added);
    return { added: added.length, skipped, possibleDuplicates };
  },
});

/** Get the current user's music requests. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return [];
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", caller.email))
      .order("desc")
      .take(200);
    return await forViewer(ctx, caller, rows);
  },
});
/** Get pending music requests. Praise Manager only. */
export const toReview = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireProfile(ctx);
    if (!(await seesReviewQueue(ctx, caller))) {
      throw new ConvexError("Only Praise Managers can review music requests.");
    }
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .order("desc")
      .take(200);
    return await forViewer(ctx, caller, rows);
  },
});

/** Get declined music requests. Praise Manager only. */
export const declined = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireProfile(ctx);
    if (!(await seesReviewQueue(ctx, caller))) {
      throw new ConvexError(
        "Only Praise Managers can view declined music requests.",
      );
    }
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "DECLINED"))
      .order("desc")
      .take(200);
    return await forViewer(ctx, caller, rows);
  },
});
/** Get approved music requests. */
export const approved = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return [];
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
      .order("desc")
      .take(200);
    return await forViewer(ctx, caller, rows);
  },
});

const MAX_PAGE = 50;

const capped = (opts: PaginationOptions): PaginationOptions => ({
  ...opts,
  numItems: Math.min(Math.max(opts.numItems, 1), MAX_PAGE),
});

async function seesRequestNotes(ctx: QueryCtx, caller: CallerContext) {
  if (await seesReviewQueue(ctx, caller)) return true;
  return await viewsAsAdmin(ctx, caller);
}

async function forViewer(
  ctx: QueryCtx,
  caller: CallerContext,
  rows: MusicRequestRow[],
) {
  const seesNotes = await seesRequestNotes(ctx, caller);
  const me = caller.email.toLowerCase();
  return (await withNames(ctx, rows)).map((row) =>
    seesNotes || row.requesterEmail.toLowerCase() === me
      ? row
      : { ...row, requestComment: undefined, declineComment: undefined },
  );
}

const requestStatus = v.union(
  v.literal("PENDING"),
  v.literal("APPROVED"),
  v.literal("DECLINED"),
);

const approvedSort = v.union(
  v.literal("title-asc"),
  v.literal("title-desc"),
  v.literal("artist-asc"),
  v.literal("artist-desc"),
  v.literal("approved-desc"),
  v.literal("release-desc"),
);

const MAX_SEARCH_LENGTH = 100;

async function approvedSongsPage(
  ctx: QueryCtx,
  sort: Infer<typeof approvedSort>,
  opts: PaginationOptions,
) {
  const songs = ctx.db.query("musicRequests");
  const ascending = sort.endsWith("-asc") ? "asc" : "desc";
  if (sort === "title-asc" || sort === "title-desc") {
    return await songs
      .withIndex("by_status_and_title_sort", (q) => q.eq("status", "APPROVED"))
      .order(ascending)
      .paginate(opts);
  }
  if (sort === "artist-asc" || sort === "artist-desc") {
    return await songs
      .withIndex("by_status_and_artist_sort", (q) => q.eq("status", "APPROVED"))
      .order(ascending)
      .paginate(opts);
  }
  if (sort === "release-desc") {
    return await songs
      .withIndex("by_status_and_release_date", (q) => q.eq("status", "APPROVED"))
      .order("desc")
      .paginate(opts);
  }
  return await songs
    .withIndex("by_status_and_reviewed_time", (q) => q.eq("status", "APPROVED"))
    .order("desc")
    .paginate(opts);
}

export const approvedPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sort: approvedSort,
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const search = args.search?.trim().slice(0, MAX_SEARCH_LENGTH);
    const opts = capped(args.paginationOpts);
    const page = search
      ? await ctx.db
          .query("musicRequests")
          .withSearchIndex("search_songs", (q) =>
            q.search("searchText", search).eq("status", "APPROVED"),
          )
          .paginate(opts)
      : await approvedSongsPage(ctx, args.sort, opts);
    return { ...page, page: await forViewer(ctx, caller, page.page) };
  },
});

export const myRequestsPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(requestStatus),
  },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const opts = capped(args.paginationOpts);
    const { status } = args;
    const page = status
      ? await ctx.db
          .query("musicRequests")
          .withIndex("by_requester_and_status", (q) =>
            q.eq("requesterEmail", caller.email).eq("status", status),
          )
          .order("desc")
          .paginate(opts)
      : await ctx.db
          .query("musicRequests")
          .withIndex("by_requester", (q) => q.eq("requesterEmail", caller.email))
          .order("desc")
          .paginate(opts);
    return { ...page, page: await forViewer(ctx, caller, page.page) };
  },
});

export const reviewPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.union(v.literal("PENDING"), v.literal("DECLINED")),
  },
  handler: async (ctx, args) => {
    const caller = await optionalProfile(ctx);
    if (!caller || !(await seesReviewQueue(ctx, caller))) return null;
    const page = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(capped(args.paginationOpts));
    return { ...page, page: await forViewer(ctx, caller, page.page) };
  },
});

export const praiseManagers = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const year = currentStaffYear();
    const nameOf = nameResolver(ctx);
    const people: { email: string; name: string }[] = [];
    for (const email of await praiseManagerEmailsForYear(ctx, year)) {
      if (!(await getProfile(ctx, email.trim().toLowerCase(), year))) continue;
      people.push({ email, name: (await nameOf(email)) ?? email });
    }
    return people;
  },
});
export async function songsWaitingOn(
  ctx: QueryCtx,
  caller: CallerContext,
  lens: Lens,
): Promise<number> {
  const waits = await waitsThrough(
    lens,
    () => callerIsPraiseManager(ctx, caller),
    (persona) => persona.role === "praiseManager",
  );
  if (!waits) return 0;
  const pending = await ctx.db
    .query("musicRequests")
    .withIndex("by_status", (q) => q.eq("status", "PENDING"))
    .take(SONGS_COUNTED + 1);
  return pending.length;
}

export const waitingOnMe = query({
  args: {},
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return 0;
    return await songsWaitingOn(ctx, caller, await lensFor(ctx, caller));
  },
});
/** Approve a pending music request. */
export const approve = mutation({
  args: { requestId: v.id("musicRequests") },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (!(await callerIsPraiseManager(ctx, caller))) {
      throw new ConvexError("Only Praise Managers can approve music requests.");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    if (request.status !== "PENDING") {
      throw new ConvexError("This request has already been reviewed.");
    }
    await ctx.db.patch(args.requestId, {
      status: "APPROVED",
      reviewedByEmail: caller.email,
      reviewedTime: Date.now(),
    });

    const reviewerName = await resolveName(
      ctx,
      caller.email,
      currentStaffYear(),
    );

    await notify(
      ctx,
      [request.requesterEmail],
      "Music request approved",
      `"${request.title}" was approved by ${reviewerName}`,
      "/music?tab=my-requests",
      caller.email,
    );
  },
});
/** Decline a pending music request. */
export const decline = mutation({
  args: {
    requestId: v.id("musicRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (!(await callerIsPraiseManager(ctx, caller))) {
      throw new ConvexError("Only Praise Managers can decline music requests.");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    if (request.status !== "PENDING") {
      throw new ConvexError("This request has already been reviewed.");
    }
    const declineComment = cleanComment(args.reason, "Decline reason");
    const reviewerName = await resolveName(
      ctx,
      caller.email,
      currentStaffYear(),
    );
    await ctx.db.patch(args.requestId, {
      status: "DECLINED",
      reviewedByEmail: caller.email,
      reviewedTime: Date.now(),
      declineComment,
    });
    await notify(
      ctx,
      [request.requesterEmail],
      "Music request declined",
      declineComment
        ? `"${request.title}" was declined: ${declineComment}`
        : `"${request.title}" was declined by ${reviewerName}`,
      "/music?tab=my-requests",
      caller.email,
    );
  },
});
/** Edit a music request. */
export const update = mutation({
  args: {
    requestId: v.id("musicRequests"),
    title: v.string(),
    artist: v.string(),
    link: v.string(),
    requestComment: v.optional(v.string()),
    albumArtUrl: v.optional(v.string()),
    isrc: v.optional(v.string()),
    allowPossibleDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found.");
    }
    const isPraiseManager = await callerIsPraiseManager(ctx, caller);
    const isOwner =
      request.requesterEmail.toLowerCase() === caller.email.toLowerCase();
    if (!isPraiseManager && (!isOwner || request.status !== "PENDING")) {
      throw new ConvexError("You can only edit your own pending requests.");
    }
    if (request.status !== "PENDING" && request.status !== "APPROVED") {
      throw new ConvexError("This request cannot be edited.");
    }
    const song = validateSong(args);
    const { title, artist, link } = song;
    const requestComment = cleanComment(args.requestComment, "Request comment");
    const duplicate = await findIndexedDuplicate(ctx, song, args.requestId);
    if (duplicate?.kind === "exact")
      throw new ConvexError("This recording has already been submitted.");
    if (duplicate?.kind === "possible" && !args.allowPossibleDuplicate)
      throw new ConvexError(
        "Possible duplicate: confirm that you want to use this version.",
      );
    const keys = songKeys(song);
    const recordingChanged = keys.spotifyTrackId !== request.spotifyTrackId;
    await ctx.db.patch("musicRequests", args.requestId, {
      title,
      artist,
      link,
      isrc: song.isrc,
      requestComment,
      ...keys,
      albumArtUrl: songArtworkUrl(link, args.albumArtUrl?.trim()),
      ...(recordingChanged ? { releaseDate: undefined } : {}),
    });
    if (recordingChanged || !request.releaseDate) {
      await fetchReleaseDateLater(ctx, args.requestId, keys.spotifyTrackId);
    }
  },
});
/** Delete a music request. */
export const remove = mutation({
  args: {
    requestId: v.id("musicRequests"),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Request not found.");
    }
    const isPraiseManager = await callerIsPraiseManager(ctx, caller);
    const isOwner =
      request.requesterEmail.toLowerCase() === caller.email.toLowerCase();
    if (!isPraiseManager && (!isOwner || request.status !== "PENDING")) {
      throw new ConvexError("You can only delete your own pending requests.");
    }
    if (request.status !== "PENDING" && request.status !== "APPROVED") {
      throw new ConvexError("This request cannot be deleted.");
    }
    await ctx.db.delete(args.requestId);
  },
});
