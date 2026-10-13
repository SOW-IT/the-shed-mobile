import { ConvexError, v } from "convex/values";
import { isChaplainRole } from "../shared/flow";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { findMemberByEmail, requireProfile, rolesOf } from "./model";

/** Check whether the caller has a Chaplain role. */
const callerIsChaplain = (profile: Doc<"staffProfiles">) =>
  rolesOf(profile).some(isChaplainRole);

/** Get Chaplain emails for the current year. */
async function chaplainEmailsForYear(
  ctx: any,
  year: number,
): Promise<string[]> {
  const profiles = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q: any) => q.eq("year", year))
    .take(1000);

  return profiles
    .filter((p: Doc<"staffProfiles">) => rolesOf(p).some(isChaplainRole))
    .map((p: Doc<"staffProfiles">) => p.email);
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

/** Prefer approved, then pending, then declined if multiple rows share a track. */
async function findDuplicateMusicRequest(
  ctx: any,
  link: string,
): Promise<MusicRequestRow | null> {
  const id = spotifyTrackId(link);
  if (!id) return null;

  const rows: MusicRequestRow[] = await ctx.db.query("musicRequests").collect();
  const matches = rows.filter((row) => spotifyTrackId(row.link) === id);

  return (
    matches.find((row) => row.status === "APPROVED") ??
    matches.find((row) => row.status === "PENDING") ??
    matches.find((row) => row.status === "DECLINED") ??
    null
  );
}

/** Check whether a Spotify track has already been requested. */
export const checkDuplicate = query({
  args: { link: v.string() },
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    const duplicate = await findDuplicateMusicRequest(ctx, args.link);
    if (!duplicate) return null;

    return {
      title: duplicate.title,
      artist: duplicate.artist,
      status: duplicate.status,
      albumArtUrl: duplicate.albumArtUrl,
    };
  },
});

/** Submit a new music request. */
export const submit = mutation({
  args: {
    title: v.string(),
    artist: v.string(),
    link: v.string(),
    requestComment: v.optional(v.string()),
    albumArtUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);

    const title = args.title.trim();
    if (!title) throw new ConvexError("Please enter a song title.");

    const artist = args.artist.trim();
    if (!artist) throw new ConvexError("Please enter an artist name.");

    const link = args.link.trim();
    if (!link) throw new ConvexError("Please enter a song link.");

    const duplicate = await findDuplicateMusicRequest(ctx, link);
    if (duplicate?.status === "APPROVED") {
      throw new ConvexError("This song is already in the approved playlist.");
    }
    if (duplicate?.status === "PENDING") {
      throw new ConvexError(
        "This song has already been requested and is awaiting review.",
      );
    }

    const requestComment = args.requestComment?.trim() || undefined;
    const isSpotifyTrack = spotifyTrackId(link) !== null;
    const artwork = args.albumArtUrl?.trim();
    const albumArtUrl =
      isSpotifyTrack && artwork && /^https:\/\//i.test(artwork)
        ? artwork
        : undefined;

    const id = await ctx.db.insert("musicRequests", {
      requesterEmail: caller.email,
      title,
      artist,
      link,
      requestComment,
      albumArtUrl,
      status: "PENDING",
    });

    const chaplains = await chaplainEmailsForYear(ctx, caller.year);
    await notify(
      ctx,
      chaplains,
      "New music request",
      `${caller.email} requested "${title}"`,
      "/music?tab=review",
    );
    return id;
  },
});

/** Get the current user's music requests. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireProfile(ctx);
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_requester", (q) => q.eq("requesterEmail", caller.email))
      .order("desc")
      .take(200);

    return Promise.all(
      rows.map(async (row) => {
        const member = await findMemberByEmail(ctx, row.requesterEmail);
        const reviewer = await findMemberByEmail(ctx, row.reviewedByEmail);
        return {
          ...row,
          requesterName: member?.name ?? null,
          reviewerName: reviewer?.name ?? null,
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
    if (!callerIsChaplain(caller.profile)) {
      throw new ConvexError("Only Chaplains can review music requests.");
    }

    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .order("desc")
      .take(200);

    return Promise.all(
      rows.map(async (row) => {
        const member = await findMemberByEmail(ctx, row.requesterEmail);
        const reviewer = await findMemberByEmail(ctx, row.reviewedByEmail);
        return {
          ...row,
          requesterName: member?.name ?? null,
          reviewerName: reviewer?.name ?? null,
        };
      }),
    );
  },
});

/** Get approved music requests. */
export const approved = query({
  args: {},
  handler: async (ctx) => {
    await requireProfile(ctx);
    const rows = await ctx.db
      .query("musicRequests")
      .withIndex("by_status", (q) => q.eq("status", "APPROVED"))
      .order("desc")
      .take(200);

    return Promise.all(
      rows.map(async (row) => {
        const member = await findMemberByEmail(ctx, row.requesterEmail);
        const reviewer = await findMemberByEmail(ctx, row.reviewedByEmail);
        return {
          ...row,
          requesterName: member?.name ?? null,
          reviewerName: reviewer?.name ?? null,
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
    if (!callerIsChaplain(caller.profile)) {
      throw new ConvexError("Only Chaplains can approve music requests.");
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

    await notify(
      ctx,
      [request.requesterEmail],
      "Music request approved",
      `"${request.title}" was approved by ${caller.email}`,
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
    if (!callerIsChaplain(caller.profile)) {
      throw new ConvexError("Only Chaplains can decline music requests.");
    }

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new ConvexError("Request not found.");
    if (request.status !== "PENDING") {
      throw new ConvexError("This request has already been reviewed.");
    }

    const declineComment = args.reason?.trim() || undefined;
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
        : `"${request.title}" was declined by ${caller.email}`,
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
  },
  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);
    const request = await ctx.db.get(args.requestId);

    if (!request) {
      throw new ConvexError("Request not found.");
    }

    const isChaplain = callerIsChaplain(caller.profile);
    const isOwner = request.requesterEmail === caller.email;

    if (!isChaplain && (!isOwner || request.status !== "PENDING")) {
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

    const trackId = spotifyTrackId(link);

    if (trackId) {
      const requests = await ctx.db.query("musicRequests").collect();

      const duplicate = requests.find(
        (row) =>
          row._id !== args.requestId &&
          (row.status === "PENDING" || row.status === "APPROVED") &&
          spotifyTrackId(row.link) === trackId,
      );

      if (duplicate) {
        throw new ConvexError("This song is already pending or approved.");
      }
    }

    const artwork = args.albumArtUrl?.trim();

    await ctx.db.patch(args.requestId, {
      title,
      artist,
      link,
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

    const isChaplain = callerIsChaplain(caller.profile);
    const isOwner = request.requesterEmail === caller.email;

    if (!isChaplain && (!isOwner || request.status !== "PENDING")) {
      throw new ConvexError("You can only delete your own pending requests.");
    }

    if (request.status !== "PENDING" && request.status !== "APPROVED") {
      throw new ConvexError("This request cannot be deleted.");
    }

    await ctx.db.delete(args.requestId);
  },
});
