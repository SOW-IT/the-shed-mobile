import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { songKeys } from "./musicRequests";
import {
  songArtworkUrl,
  spotifyTrackId,
  youtubeVideoId,
} from "./shared/musicLinks";

const RELEASE_DATE_SPACING_MS = 250;

/** Fills the duplicate-detection keys with the same rules `submit` uses. */
export const backfill = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    checked: number;
    updated: number;
    isDone: boolean;
    continueCursor: string;
  }> => {
    const page = await ctx.db.query("musicRequests").paginate({
      cursor: args.cursor ?? null,
      numItems: 100,
    });

    let updated = 0;
    let releaseDateLookups = 0;

    for (const row of page.page) {
      const keys = songKeys(row);
      const albumArtUrl =
        youtubeVideoId(row.link) || spotifyTrackId(row.link)
          ? songArtworkUrl(row.link, row.albumArtUrl)
          : row.albumArtUrl;

      if (
        row.normalizedSongKey !== keys.normalizedSongKey ||
        row.spotifyTrackId !== keys.spotifyTrackId ||
        row.youtubeVideoId !== keys.youtubeVideoId ||
        row.titleSort !== keys.titleSort ||
        row.artistSort !== keys.artistSort ||
        row.searchText !== keys.searchText ||
        row.albumArtUrl !== albumArtUrl
      ) {
        await ctx.db.patch("musicRequests", row._id, { ...keys, albumArtUrl });
        updated++;
      }
      if (keys.spotifyTrackId && !row.releaseDate) {
        await ctx.scheduler.runAfter(
          releaseDateLookups * RELEASE_DATE_SPACING_MS,
          internal.musicReleaseDates.fill,
          { requestId: row._id },
        );
        releaseDateLookups++;
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(
        releaseDateLookups * RELEASE_DATE_SPACING_MS,
        internal.musicBackfill.backfill,
        { cursor: page.continueCursor },
      );
    }

    return {
      checked: page.page.length,
      updated,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
