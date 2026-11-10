import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { spotifyTrackId } from "./shared/musicLinks";

type SpotifyTrack = {
  id?: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string; width?: number }[]; release_date?: string };
  external_ids?: {
    isrc?: string;
  };
  is_local?: boolean;
  type?: string;
};

const SEARCH_RESULTS = 10;
const MAX_SEARCH_LENGTH = 100;

export async function spotifyToken(): Promise<string> {
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

export async function spotifyTrack(id: string, token: string): Promise<SpotifyTrack> {
  const response = await fetch(`https://api.spotify.com/v1/tracks/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new ConvexError(`Spotify track lookup failed (${response.status}).`);
  return await response.json();
}

const smallestImage = (images: { url: string; width?: number }[]) =>
  [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url ?? null;

export const searchTracks = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!(await getAuthUserId(ctx))) {
      throw new ConvexError("You must be signed in.");
    }
    const query = args.query.trim();
    if (query.length < 2) return [];
    if (query.length > MAX_SEARCH_LENGTH) {
      throw new ConvexError(`Search for ${MAX_SEARCH_LENGTH} characters or fewer.`);
    }
    const token = await spotifyToken();
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(SEARCH_RESULTS),
      market: "AU",
    });
    const response = await fetch(`https://api.spotify.com/v1/search?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok)
      throw new ConvexError(`Spotify search failed (${response.status}).`);
    const data: { tracks?: { items?: (SpotifyTrack | null)[] } } = await response.json();
    return (data.tracks?.items ?? []).flatMap((track) =>
      track?.id && !track.is_local
        ? [
            {
              title: track.name,
              artist: track.artists.map((artist) => artist.name).join(", "),
              albumArtUrl: track.album.images[0]?.url ?? null,
              thumbnailUrl: smallestImage(track.album.images),
              link: `https://open.spotify.com/track/${track.id}`,
              isrc: track.external_ids?.isrc ?? null,
              releaseDate: track.album.release_date ?? null,
            },
          ]
        : [],
    );
  },
});

export const getTrack = action({
  args: { link: v.string() },
  handler: async (ctx, args) => {
    // Our Spotify app's quota is for SHED users, not anyone with the URL.
    if (!(await getAuthUserId(ctx))) {
      throw new ConvexError("You must be signed in.");
    }
    const id = spotifyTrackId(args.link);
    if (!id) throw new ConvexError("Invalid Spotify track URL.");
    const track = await spotifyTrack(id, await spotifyToken());
    return {
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      albumArtUrl: track.album.images[0]?.url ?? null,
      link: `https://open.spotify.com/track/${id}`,
      isrc: track.external_ids?.isrc ?? null,
    };
  },
});
