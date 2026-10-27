import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  currentStaffYear,
  optionalProfile,
  requireProfile,
  resolveName,
} from "./model";

/** Get Praise Manager emails for the active staff year. */
async function praiseManagerEmailsForYear(
  ctx: any,
  year: number,
): Promise<string[]> {
  const settings = await ctx.db
    .query("yearSettings")
    .withIndex("by_year", (q: any) => q.eq("year", year))
    .first();
  return settings?.praiseManagerEmails ?? [];
}

/** Check whether the caller is an assigned Praise Manager. */
async function callerIsPraiseManager(
  ctx: any,
  email: string,
): Promise<boolean> {
  const managers = await praiseManagerEmailsForYear(ctx, currentStaffYear());

  return managers.some(
    (managerEmail) => managerEmail.toLowerCase() === email.toLowerCase(),
  );
}

/** Create in-app notifications. */
async function notify(
  ctx: any,
  emails: string[],
  title: string,
  body: string,
  url?: string,
) {
  for (const userEmail of new Set(emails)) {
    await ctx.db.insert("notifications", {
      userEmail,
      title,
      body,
      url,
      read: false,
    });
  }
}

/** Extract a Spotify track ID, ignoring query parameters and regional URL prefixes. */
function spotifyTrackId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "open.spotify.com" &&
        url.hostname !== "www.open.spotify.com")
    ) {
      return null;
    }
    return (
      url.pathname.match(
        /^\/(?:intl-[a-zA-Z-]+\/)?track\/([a-zA-Z0-9]+)\/?$/,
      )?.[1] ?? null
    );
  } catch {
    return null;
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

function normalizedSongKey(title: string, artist: string): string {
  return JSON.stringify([normalized(title), normalized(artist)]);
}

function duplicateKind(
  row: MusicRequestRow,
  song: { link: string; title: string; artist: string; isrc?: string },
): "exact" | "possible" | null {
  const incomingId = spotifyTrackId(song.link);
  const existingId = spotifyTrackId(row.link);
  if (incomingId && existingId && incomingId === existingId) return "exact";
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

function preferredDuplicate(
  rows: MusicRequestRow[],
  song: { link: string; title: string; artist: string; isrc?: string },
  excludeId?: string,
) {
  const matches = rows
    .filter((row) => row._id !== excludeId)
    .map((row) => ({ row, kind: duplicateKind(row, song) }))
    .filter(
      (entry): entry is { row: MusicRequestRow; kind: "exact" | "possible" } =>
        entry.kind !== null,
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

async function findIndexedDuplicate(
  ctx: MusicCtx,
  song: SongInput,
  excludeId?: string,
) {
  const trackId = spotifyTrackId(song.link);
  const isrc = song.isrc?.trim().toUpperCase();
  const songKey = normalizedSongKey(song.title, song.artist);

  const [spotifyMatches, isrcMatches, titleMatches] = await Promise.all([
    trackId
      ? ctx.db
          .query("musicRequests")
          .withIndex("by_spotify_track_id", (q) =>
            q.eq("spotifyTrackId", trackId),
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

  for (const row of [...spotifyMatches, ...isrcMatches, ...titleMatches]) {
    matches.set(row._id, row);
  }

  const candidates = [...matches.values()].filter(
    (row) => row._id !== excludeId,
  );

  return preferredDuplicate(candidates, song);
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
  },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    const duplicate = await findIndexedDuplicate(ctx, {
      link: args.link,
      title: args.title ?? "",
      artist: args.artist ?? "",
      isrc: args.isrc,
    });
    if (!duplicate) return null;
    return {
      title: duplicate.row.title,
      artist: duplicate.row.artist,
      status: duplicate.row.status,
      albumArtUrl: duplicate.row.albumArtUrl,
      kind: duplicate.kind,
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

    const artwork = args.albumArtUrl?.trim();
    const albumArtUrl =
      spotifyTrackId(song.link) && artwork && /^https:\/\//i.test(artwork)
        ? artwork
        : undefined;
    const isPraiseManager = await callerIsPraiseManager(ctx, caller.email);
    const id = await ctx.db.insert("musicRequests", {
      requesterEmail: caller.email,
      ...song,
      spotifyTrackId: spotifyTrackId(song.link) ?? undefined,
      normalizedSongKey: normalizedSongKey(song.title, song.artist),
      requestComment,
      albumArtUrl,
      status: isPraiseManager ? "APPROVED" : "PENDING",
      ...(isPraiseManager
        ? { reviewedByEmail: caller.email, reviewedTime: Date.now() }
        : {}),
    });
    if (!isPraiseManager) {
      await notify(
        ctx,
        await praiseManagerEmailsForYear(ctx, currentStaffYear()),
        "New music request",
        `${caller.email} requested "${song.title}"`,
        "/music?tab=review",
      );
    }
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    if (!args.songs.length || args.songs.length > 50)
      throw new ConvexError("Add between 1 and 50 songs.");
    const batchSongs: MusicRequestRow[] = [];
    let exactDuplicates = 0;
    let possibleDuplicates = 0;
    for (const raw of args.songs) {
      const song = validateSong(raw);
      const databaseDuplicate = await findIndexedDuplicate(ctx, song);
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
      }),
    ),
    requestComment: v.optional(v.string()),
    allowPossibleDuplicates: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const requestComment = cleanComment(args.requestComment, "Request comment");
    if (!args.songs.length || args.songs.length > 50)
      throw new ConvexError("Add between 1 and 50 songs.");
    const isPraiseManager = await callerIsPraiseManager(ctx, caller.email);
    const added: string[] = [];
    let skipped = 0;
    let possibleDuplicates = 0;
    for (const raw of args.songs) {
      const song = validateSong(raw);
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
      const artwork = raw.albumArtUrl?.trim();
      const id = await ctx.db.insert("musicRequests", {
        requesterEmail: caller.email,
        ...song,
        spotifyTrackId: spotifyTrackId(song.link) ?? undefined,
        normalizedSongKey: normalizedSongKey(song.title, song.artist),
        albumArtUrl:
          spotifyTrackId(song.link) && artwork && /^https:\/\//i.test(artwork)
            ? artwork
            : undefined,
        requestComment,
        status: isPraiseManager ? "APPROVED" : "PENDING",
        ...(isPraiseManager
          ? { reviewedByEmail: caller.email, reviewedTime: Date.now() }
          : {}),
      });
      added.push(id);
    }
    if (!isPraiseManager && added.length)
      await notify(
        ctx,
        await praiseManagerEmailsForYear(ctx, currentStaffYear()),
        "New music requests",
        `${caller.email} requested ${added.length} song(s).`,
        "/music?tab=review",
      );
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

    return Promise.all(
      rows.map(async (row) => {
        const requesterName = await resolveName(
          ctx,
          row.requesterEmail,
          currentStaffYear(),
        );
        const reviewerName = row.reviewedByEmail
          ? await resolveName(ctx, row.reviewedByEmail, currentStaffYear())
          : null;
        return {
          ...row,
          requesterName,
          reviewerName,
        };
      }),
    );
  },
});
/** Get pending music requests. Praise Manager only. */
export const toReview = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireProfile(ctx);
    if (!(await callerIsPraiseManager(ctx, caller.email))) {
      throw new ConvexError("Only Praise Managers can review music requests.");
    }
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .order("desc")
      .take(200);
    return Promise.all(
      rows.map(async (row) => {
        const requesterName = await resolveName(
          ctx,
          row.requesterEmail,
          currentStaffYear(),
        );
        const reviewerName = row.reviewedByEmail
          ? await resolveName(ctx, row.reviewedByEmail, currentStaffYear())
          : null;
        return {
          ...row,
          requesterName,
          reviewerName,
        };
      }),
    );
  },
});

/** Get declined music requests. Praise Manager only. */
export const declined = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireProfile(ctx);
    if (!(await callerIsPraiseManager(ctx, caller.email))) {
      throw new ConvexError(
        "Only Praise Managers can view declined music requests.",
      );
    }

    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "DECLINED"))
      .order("desc")
      .take(200);
    return Promise.all(
      rows.map(async (row) => {
        const requesterName = await resolveName(
          ctx,
          row.requesterEmail,
          currentStaffYear(),
        );
        const reviewerName = row.reviewedByEmail
          ? await resolveName(ctx, row.reviewedByEmail, currentStaffYear())
          : null;
        return {
          ...row,
          requesterName,
          reviewerName,
        };
      }),
    );
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
    return Promise.all(
      rows.map(async (row) => {
        const requesterName = await resolveName(
          ctx,
          row.requesterEmail,
          currentStaffYear(),
        );
        const reviewerName = row.reviewedByEmail
          ? await resolveName(ctx, row.reviewedByEmail, currentStaffYear())
          : null;
        return {
          ...row,
          requesterName,
          reviewerName,
        };
      }),
    );
  },
});
/** Approve a pending music request. */
export const approve = mutation({
  args: { requestId: v.id("musicRequests") },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    if (!(await callerIsPraiseManager(ctx, caller.email))) {
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
    if (!(await callerIsPraiseManager(ctx, caller.email))) {
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
    const isPraiseManager = await callerIsPraiseManager(ctx, caller.email);
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
    const trackId = spotifyTrackId(link);
    const artwork = args.albumArtUrl?.trim();
    await ctx.db.patch(args.requestId, {
      title,
      artist,
      link,
      isrc: song.isrc,
      requestComment,
      spotifyTrackId: spotifyTrackId(song.link) ?? undefined,
      normalizedSongKey: normalizedSongKey(song.title, song.artist),
      albumArtUrl:
        trackId && artwork && /^https:\/\//i.test(artwork)
          ? artwork
          : undefined,
    });
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
    const isPraiseManager = await callerIsPraiseManager(ctx, caller.email);
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
