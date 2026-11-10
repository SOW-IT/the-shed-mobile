import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  type ActionCtx,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { spotifyTrackId } from "./shared/musicLinks";
import { decryptSpotifyToken, encryptSpotifyToken } from "./spotifyCrypto";

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
export const SEARCHES_PER_WINDOW = 30;
export const SEARCH_WINDOW_MS = 60_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const DEFAULT_TOKEN_LIFETIME_S = 3600;

export const cachedAppToken = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cached = await ctx.db.query("spotifyAppTokens").first();
    return cached && cached.expiresAt - TOKEN_EXPIRY_MARGIN_MS > Date.now()
      ? cached.encryptedAccessToken
      : null;
  },
});

export const saveAppToken = internalMutation({
  args: { encryptedAccessToken: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    for (const old of await ctx.db.query("spotifyAppTokens").take(10)) {
      await ctx.db.delete("spotifyAppTokens", old._id);
    }
    await ctx.db.insert("spotifyAppTokens", args);
    return null;
  },
});

export const countSearch = internalMutation({
  args: { userKey: v.string() },
  handler: async (ctx, { userKey }) => {
    const now = Date.now();
    const usage = await ctx.db
      .query("spotifySearchUsage")
      .withIndex("by_userKey", (q) => q.eq("userKey", userKey))
      .unique();
    if (!usage) {
      await ctx.db.insert("spotifySearchUsage", { userKey, windowStart: now, count: 1 });
      return null;
    }
    if (now - usage.windowStart >= SEARCH_WINDOW_MS) {
      await ctx.db.patch("spotifySearchUsage", usage._id, { windowStart: now, count: 1 });
      return null;
    }
    if (usage.count >= SEARCHES_PER_WINDOW) {
      throw new ConvexError("Too many Spotify searches. Wait a minute and try again.");
    }
    await ctx.db.patch("spotifySearchUsage", usage._id, { count: usage.count + 1 });
    return null;
  },
});

const canCacheToken = () => !!process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;

export async function spotifyToken(ctx: ActionCtx, fresh = false): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new ConvexError("Spotify credentials are not configured.");
  if (!fresh && canCacheToken()) {
    const cached = await ctx.runQuery(internal.spotify.cachedAppToken, {});
    if (cached) return await decryptSpotifyToken(cached);
  }
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
  const data: { access_token: string; expires_in?: number } = await response.json();
  if (canCacheToken()) {
    await ctx.runMutation(internal.spotify.saveAppToken, {
      encryptedAccessToken: await encryptSpotifyToken(data.access_token),
      expiresAt: Date.now() + (data.expires_in ?? DEFAULT_TOKEN_LIFETIME_S) * 1000,
    });
  }
  return data.access_token;
}

async function spotifyGet(ctx: ActionCtx, url: string): Promise<Response> {
  const call = async (token: string) =>
    await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const response = await call(await spotifyToken(ctx));
  if (response.status !== 401) return response;
  return await call(await spotifyToken(ctx, true));
}

export async function spotifyTrack(ctx: ActionCtx, id: string): Promise<SpotifyTrack> {
  const response = await spotifyGet(ctx, `https://api.spotify.com/v1/tracks/${id}`);
  if (!response.ok)
    throw new ConvexError(`Spotify track lookup failed (${response.status}).`);
  return await response.json();
}

const smallestImage = (images: { url: string; width?: number }[]) =>
  [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0]?.url ?? null;

export const searchTracks = action({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new ConvexError("You must be signed in.");
    }
    const query = args.query.trim();
    if (query.length < 2) return [];
    if (query.length > MAX_SEARCH_LENGTH) {
      throw new ConvexError(`Search for ${MAX_SEARCH_LENGTH} characters or fewer.`);
    }
    await ctx.runMutation(internal.spotify.countSearch, { userKey: userId });
    const params = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(SEARCH_RESULTS),
      market: "AU",
    });
    const response = await spotifyGet(ctx, `https://api.spotify.com/v1/search?${params}`);
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
    const track = await spotifyTrack(ctx, id);
    return {
      title: track.name,
      artist: track.artists.map((artist) => artist.name).join(", "),
      albumArtUrl: track.album.images[0]?.url ?? null,
      link: `https://open.spotify.com/track/${id}`,
      isrc: track.external_ids?.isrc ?? null,
    };
  },
});
