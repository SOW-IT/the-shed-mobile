import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { spotifyTrack } from "./spotify";

export const trackOf = internalQuery({
  args: { requestId: v.id("musicRequests") },
  handler: async (ctx, { requestId }) => {
    const row = await ctx.db.get("musicRequests", requestId);
    return row?.spotifyTrackId ?? null;
  },
});

export const save = internalMutation({
  args: {
    requestId: v.id("musicRequests"),
    spotifyTrackId: v.string(),
    releaseDate: v.string(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get("musicRequests", args.requestId);
    if (row?.spotifyTrackId !== args.spotifyTrackId) return null;
    await ctx.db.patch("musicRequests", args.requestId, { releaseDate: args.releaseDate });
    return null;
  },
});

export const fill = internalAction({
  args: { requestId: v.id("musicRequests") },
  handler: async (ctx, { requestId }) => {
    if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
    const spotifyTrackId = await ctx.runQuery(internal.musicReleaseDates.trackOf, { requestId });
    if (!spotifyTrackId) return null;
    try {
      const track = await spotifyTrack(ctx, spotifyTrackId);
      const releaseDate = track.album.release_date;
      if (!releaseDate) return null;
      await ctx.runMutation(internal.musicReleaseDates.save, {
        requestId,
        spotifyTrackId,
        releaseDate,
      });
    } catch (error) {
      console.warn(`No release date for ${spotifyTrackId}: ${String(error)}`);
    }
    return null;
  },
});
