import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
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
  const isrc = song.isrc?.trim().toUpperCase() || undefined;
  if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/.test(isrc))
    throw new ConvexError("Invalid ISRC format.");
  return { title, artist, link, isrc };
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
    const rows = await ctx.db.query("musicRequests").collect();
    const duplicate = preferredDuplicate(rows, {
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
    const caller = await optionalProfile(ctx);
    if (!caller) return [];
    const song = validateSong(args);
    const rows = await ctx.db.query("musicRequests").collect();
    const duplicate = preferredDuplicate(rows, song);
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
      requestComment: args.requestComment?.trim() || undefined,
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
    const existing = await ctx.db.query("musicRequests").collect();
    let exactDuplicates = 0;
    let possibleDuplicates = 0;
    for (const raw of args.songs) {
      const song = validateSong(raw);
      const duplicate = preferredDuplicate(existing, song);
      if (duplicate?.kind === "exact") exactDuplicates++;
      else if (duplicate?.kind === "possible") possibleDuplicates++;
      // Include songs in this batch when checking subsequent entries.
      existing.push({
        ...song,
        _id: `preview-${existing.length}`,
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
    if (!args.songs.length || args.songs.length > 50)
      throw new ConvexError("Add between 1 and 50 songs.");
    const existing = await ctx.db.query("musicRequests").collect();
    const isPraiseManager = await callerIsPraiseManager(ctx, caller.email);
    const added: string[] = [];
    let skipped = 0;
    let possibleDuplicates = 0;
    for (const raw of args.songs) {
      const song = validateSong(raw);
      const duplicate = preferredDuplicate(existing, song);
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
        albumArtUrl:
          spotifyTrackId(song.link) && artwork && /^https:\/\//i.test(artwork)
            ? artwork
            : undefined,
        requestComment: args.requestComment?.trim() || undefined,
        status: isPraiseManager ? "APPROVED" : "PENDING",
        ...(isPraiseManager
          ? { reviewedByEmail: caller.email, reviewedTime: Date.now() }
          : {}),
      });
      existing.push({
        _id: id,
        ...song,
        requesterEmail: caller.email,
        status: isPraiseManager ? "APPROVED" : "PENDING",
      } as MusicRequestRow);
      added.push(song.title);
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
/** Get pending music requests. Chaplain-only. */
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
    const caller = await optionalProfile(ctx);
    if (!caller) return [];
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
    const declineComment = args.reason?.trim() || undefined;
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
    const title = args.title.trim();
    const artist = args.artist.trim();
    const link = args.link.trim();
    if (!title || !artist || !link) {
      throw new ConvexError("Title, artist and link are required.");
    }
    const song = validateSong({ title, artist, link, isrc: args.isrc });
    const requests = await ctx.db.query("musicRequests").collect();
    const duplicate = preferredDuplicate(requests, song, args.requestId);
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
      requestComment: args.requestComment?.trim() || undefined,
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
