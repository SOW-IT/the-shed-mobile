import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { normalizedSongKey, spotifyTrackId } from "./musicRequests";

/** Fills the duplicate-detection keys with the same rules `submit` uses. */
export const backfill = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("musicRequests").paginate({
      cursor: args.cursor ?? null,
      numItems: 100,
    });

    let updated = 0;

    for (const row of page.page) {
      const songKey = normalizedSongKey(row.title, row.artist);
      const spotifyId = spotifyTrackId(row.link) ?? undefined;

      if (
        row.normalizedSongKey !== songKey ||
        row.spotifyTrackId !== spotifyId
      ) {
        await ctx.db.patch(row._id, {
          normalizedSongKey: songKey,
          spotifyTrackId: spotifyId,
        });
        updated++;
      }
    }

    return {
      checked: page.page.length,
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
