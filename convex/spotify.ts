import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";

const spotifyId = (link: string, kind: "track" | "playlist"): string | null => {
  try {
    const url = new URL(link.trim());
    if (!["open.spotify.com", "www.open.spotify.com"].includes(url.hostname))
      return null;

    const match = url.pathname.match(
      new RegExp(`^/(?:intl-[a-zA-Z-]+/)?${kind}/([a-zA-Z0-9]+)/?$`),
    );

    return match?.[1] ?? null;
  } catch {
    return null;
  }
};

type SpotifyTrack = {
  id?: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  is_local?: boolean;
  type?: string;
};
type PlaylistResponse = {
  name?: string;
  tracks?: { total?: number };
};
type PlaylistItems = {
  total: number;
  next: string | null;
  items: Array<{ track?: SpotifyTrack | null; item?: SpotifyTrack | null }>;
};

async function spotifyToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new ConvexError("Spotify credentials are not configured.");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok)
    throw new ConvexError(
      `Spotify authentication failed (${response.status}).`,
    );
  const data: { access_token: string } = await response.json();
  return data.access_token;
}

export const getTrack = action({
  args: { link: v.string() },
  handler: async (_ctx, args) => {
    const id = spotifyId(args.link, "track");
    if (!id) throw new ConvexError("Invalid Spotify track URL.");
    const token = await spotifyToken();
    const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new ConvexError(
        `Spotify track lookup failed (${response.status}).`,
      );
    const track: SpotifyTrack = await response.json();
    return {
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      albumArtUrl: track.album.images[0]?.url ?? null,
      link: `https://open.spotify.com/track/${id}`,
    };
  },
});

/** Import at most 50 tracks to match musicRequests.submitMany's batch limit. */
export const getPlaylist = action({
  args: { link: v.string() },
  handler: async (_ctx, args) => {
    const id = spotifyId(args.link, "playlist");
    if (!id)
      throw new ConvexError("Please paste a valid Spotify playlist URL.");
    const token = await spotifyToken();
    const headers = { Authorization: `Bearer ${token}` };
    const playlistResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${id}?fields=name`,
      { headers },
    );
    if (!playlistResponse.ok) {
      if (playlistResponse.status === 403 || playlistResponse.status === 404)
        throw new ConvexError(
          "Spotify could not access this playlist. Check that it is accessible to your Spotify app.",
        );
      throw new ConvexError(
        `Spotify playlist lookup failed (${playlistResponse.status}).`,
      );
    }
    const playlist: PlaylistResponse = await playlistResponse.json();
    // Spotify's current playlist-items endpoint supports pagination.
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50&offset=0`,
      { headers },
    );

    if (!response.ok) {
      const details = await response.text();

      console.error("Spotify playlist API error:", {
        status: response.status,
        details,
      });

      throw new ConvexError(
        `Spotify playlist tracks lookup failed (${response.status}).`,
      );
    }
    const page: PlaylistItems = await response.json();
    const seen = new Set<string>();
    const songs: Array<{
      title: string;
      artist: string;
      link: string;
      albumArtUrl?: string;
    }> = [];
    for (const entry of page.items ?? []) {
      const track = entry.item ?? entry.track;
      if (
        !track?.id ||
        !track.name ||
        track.is_local ||
        (track.type && track.type !== "track") ||
        seen.has(track.id)
      )
        continue;
      seen.add(track.id);
      songs.push({
        title: track.name,
        artist: (track.artists ?? []).map((artist) => artist.name).join(", "),
        link: `https://open.spotify.com/track/${track.id}`,
        albumArtUrl: track.album?.images?.[0]?.url ?? undefined,
      });
    }
    return {
      name: playlist.name ?? "Spotify playlist",
      songs,
      total: page.total,
      limited: page.total > 50,
    };
  },
});
