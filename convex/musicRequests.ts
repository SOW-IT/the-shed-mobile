import { ConvexError, v } from "convex/values";
import { isChaplainRole } from "../shared/flow";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { findMemberByEmail, requireProfile, rolesOf } from "./model";

/** Check whether the caller has a Chaplain role. */
const callerIsChaplain = (profile: Doc<"staffProfiles">) =>
  rolesOf(profile).some(isChaplainRole) ||
  profile.email === "natalie.kwok@sow.org.au"; // TODO: Remove testing override before deployment

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
    .filter((p: any) => rolesOf(p).some(isChaplainRole))
    .map((p: any) => p.email);
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
    if (!title) {
      throw new ConvexError("Please enter a song title.");
    }

    const artist = args.artist.trim();
    if (!artist) {
      throw new ConvexError("Please enter an artist name.");
    }

    const link = args.link.trim();
    if (!link) {
      throw new ConvexError("Please enter a song link.");
    }

    const requestComment = args.requestComment?.trim() || undefined;

    const isSpotifyTrack =
      /^https:\/\/open\.spotify\.com\/(?:intl-[a-zA-Z-]+\/)?track\/[a-zA-Z0-9]+(?:[/?#]|$)/i.test(
        link,
      );

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
      `/request/${id}`,
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
  args: {
    requestId: v.id("musicRequests"),
  },

  handler: async (ctx, args) => {
    const caller = await requireProfile(ctx);

    if (!callerIsChaplain(caller.profile)) {
      throw new ConvexError("Only Chaplains can approve music requests.");
    }

    const request = await ctx.db.get(args.requestId);

    if (!request) {
      throw new ConvexError("Request not found.");
    }

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
      `/request/${args.requestId}`,
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

    if (!request) {
      throw new ConvexError("Request not found.");
    }

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
      `/request/${args.requestId}`,
    );
  },
});
