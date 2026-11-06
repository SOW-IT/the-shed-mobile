import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

function spotifyTrackId(value: string): string | undefined {
  try {
    const url = new URL(value.trim());

    if (
      url.protocol !== "https:" ||
      !["open.spotify.com", "www.open.spotify.com"].includes(url.hostname)
    ) {
      return undefined;
    }

    return (
      url.pathname.match(
        /^\/(?:intl-[a-zA-Z-]+\/)?track\/([a-zA-Z0-9]+)\/?$/,
      )?.[1] ?? undefined
    );
  } catch {
    return undefined;
  }
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

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
      const normalizedSongKey = JSON.stringify([
        normalized(row.title),
        normalized(row.artist),
      ]);

      const spotifyId = spotifyTrackId(row.link);

      if (
        row.normalizedSongKey !== normalizedSongKey ||
        row.spotifyTrackId !== spotifyId
      ) {
        await ctx.db.patch(row._id, {
          normalizedSongKey,
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
