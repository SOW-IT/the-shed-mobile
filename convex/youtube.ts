import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { parseYouTubeSong } from "./shared/youtube";

type YouTubePlaylistItem = {
  snippet?: {
    title?: string;
    videoOwnerChannelTitle?: string;
    channelTitle?: string;
    resourceId?: {
      videoId?: string;
    };
    thumbnails?: {
      medium?: { url: string };
      high?: { url: string };
      default?: { url: string };
    };
  };
  status?: {
    privacyStatus?: string;
  };
};

export const importPlaylist = action({
  args: {
    link: v.string(),
  },
  handler: async (ctx, { link }) => {
    // Our YouTube API key's quota is for SHED users, not anyone with the URL.
    if (!(await getAuthUserId(ctx))) {
      throw new ConvexError("You must be signed in.");
    }
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      throw new ConvexError("YouTube API key is not configured.");
    }

    // Validate and extract playlist ID.
    let playlistId: string | null = null;

    try {
      const url = new URL(link.trim());

      if (
        ![
          "youtube.com",
          "www.youtube.com",
          "m.youtube.com",
          "music.youtube.com",
        ].includes(url.hostname.toLowerCase())
      ) {
        throw new Error("Invalid YouTube domain.");
      }

      playlistId = url.searchParams.get("list");
    } catch {
      throw new ConvexError("Please enter a valid YouTube playlist URL.");
    }

    if (!playlistId || !/^[a-zA-Z0-9_-]+$/.test(playlistId)) {
      throw new ConvexError("Invalid YouTube playlist ID.");
    }

    const endpoint = new URL(
      "https://www.googleapis.com/youtube/v3/playlistItems",
    );

    endpoint.searchParams.set("part", "snippet,status");
    endpoint.searchParams.set("playlistId", playlistId);
    endpoint.searchParams.set("maxResults", "50");
    endpoint.searchParams.set("key", apiKey);

    const response = await fetch(endpoint.toString());

    if (!response.ok) {
      if (response.status === 403 || response.status === 404) {
        throw new ConvexError(
          "This playlist is unavailable. Check that it is public and the YouTube API is enabled.",
        );
      }

      throw new ConvexError(
        `YouTube playlist request failed (${response.status}).`,
      );
    }

    const data: {
      items?: YouTubePlaylistItem[];
      nextPageToken?: string;
      pageInfo?: { totalResults?: number };
    } = await response.json();

    const songs = (data.items ?? [])
      .filter((item) => {
        const snippet = item.snippet;
        return (
          !!snippet?.resourceId?.videoId &&
          snippet.title !== "Private video" &&
          snippet.title !== "Deleted video" &&
          item.status?.privacyStatus !== "private"
        );
      })
      .map((item) => {
        const snippet = item.snippet!;
        const videoId = snippet.resourceId!.videoId!;

        const { title, artist } = parseYouTubeSong(
          snippet.title ?? "Unknown song",
          snippet.videoOwnerChannelTitle ??
            snippet.channelTitle ??
            "Unknown artist",
        );
        return {
          title,
          artist,
          link: `https://www.youtube.com/watch?v=${videoId}`,
          albumArtUrl:
            snippet.thumbnails?.high?.url ??
            snippet.thumbnails?.medium?.url ??
            snippet.thumbnails?.default?.url,
        };
      });

    return {
      name: "YouTube playlist",
      songs,
      limited: !!data.nextPageToken,
    };
  },
});
