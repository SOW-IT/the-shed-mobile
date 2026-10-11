import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";

const extractSpotifyTrackId = (link: string): string | null => {
  try {
    const url = new URL(link.trim());

    if (
      url.hostname !== "open.spotify.com" &&
      url.hostname !== "www.open.spotify.com"
    ) {
      return null;
    }

    const match = url.pathname.match(
      /^\/(?:intl-[a-zA-Z-]+\/)?track\/([a-zA-Z0-9]+)\/?$/,
    );

    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

type SpotifyTrack = {
  name: string;
  artists: { name: string }[];
  album: {
    images: { url: string }[];
  };
};

export const getTrack = action({
  args: {
    link: v.string(),
  },

  handler: async (_ctx, args) => {
    const trackId = extractSpotifyTrackId(args.link);

    if (!trackId) {
      throw new ConvexError("Invalid Spotify track URL.");
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new ConvexError("Spotify credentials are not configured.");
    }

    // Authenticate with Spotify.
    const credentials = btoa(`${clientId}:${clientSecret}`);

    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );

    if (!tokenResponse.ok) {
      throw new ConvexError(
        `Spotify authentication failed (${tokenResponse.status}).`,
      );
    }

    const tokenData: { access_token: string } = await tokenResponse.json();

    // Retrieve song information.
    const trackResponse = await fetch(
      `https://api.spotify.com/v1/tracks/${trackId}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    if (!trackResponse.ok) {
      throw new ConvexError(
        `Spotify track lookup failed (${trackResponse.status}).`,
      );
    }

    const track: SpotifyTrack = await trackResponse.json();

    return {
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      albumArtUrl: track.album.images[0]?.url ?? null,
      link: `https://open.spotify.com/track/${trackId}`,
    };
  },
});
