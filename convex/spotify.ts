import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { spotifyTrackId } from "./shared/musicLinks";

type SpotifyTrack = {
  id?: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_ids?: {
    isrc?: string;
  };
  is_local?: boolean;
  type?: string;
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
  handler: async (ctx, args) => {
    // Our Spotify app's quota is for SHED users, not anyone with the URL.
    if (!(await getAuthUserId(ctx))) {
      throw new ConvexError("You must be signed in.");
    }
    const id = spotifyTrackId(args.link);
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
      isrc: track.external_ids?.isrc ?? null,
    };
  },
});
