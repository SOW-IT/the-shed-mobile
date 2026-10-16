import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { decryptSpotifyToken, encryptSpotifyToken } from "./spotifyCrypto";

/**
 * Check whether the currently signed-in SHED user
 * has connected their Spotify account.
 *
 * Never return access tokens or refresh tokens.
 */
export const getConnection = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      return { connected: false };
    }

    const connection = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    return {
      connected: connection !== null,
    };
  },
});

/**
 * Disconnect Spotify for the currently signed-in user.
 */
export const disconnect = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new ConvexError("You must be signed in.");
    }

    const connections = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    for (const connection of connections) {
      await ctx.db.delete(connection._id);
    }

    return { success: true };
  },
});

/**
 * Internal lookup for a Spotify connection.
 * Only callable by other Convex backend functions.
 */
export const getStoredConnection = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, { userId }) => {
    return await ctx.db
      .query("spotifyConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

/**
 * Save encrypted Spotify credentials.
 * Called only from trusted Convex backend functions.
 */
export const saveConnection = internalMutation({
  args: {
    userId: v.id("users"),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("spotifyConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        encryptedAccessToken: args.encryptedAccessToken,
        encryptedRefreshToken: args.encryptedRefreshToken,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });

      return existing._id;
    }

    return await ctx.db.insert("spotifyConnections", {
      userId: args.userId,
      encryptedAccessToken: args.encryptedAccessToken,
      encryptedRefreshToken: args.encryptedRefreshToken,
      expiresAt: args.expiresAt,
      connectedAt: now,
      updatedAt: now,
    });
  },
});

export const updateRefreshedConnection = internalMutation({
  args: {
    connectionId: v.id("spotifyConnections"),
    expectedUpdatedAt: v.number(),
    encryptedAccessToken: v.string(),
    encryptedRefreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);

    if (!connection || connection.updatedAt !== args.expectedUpdatedAt) {
      return false;
    }

    await ctx.db.patch(connection._id, {
      encryptedAccessToken: args.encryptedAccessToken,
      encryptedRefreshToken: args.encryptedRefreshToken,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });

    return true;
  },
});

const allowedRedirectUris = new Set([
  "https://theshed.sow.org.au/spotify-callback",
  "http://localhost:8081/spotify-callback",
  "http://127.0.0.1:8081/spotify-callback",
  "theshedmobile://spotify-callback",
]);

export const connect = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
    redirectUri: v.string(),
  },

  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new ConvexError("You must be signed in.");
    }

    if (!allowedRedirectUris.has(args.redirectUri)) {
      throw new ConvexError("Invalid Spotify redirect URI.");
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new ConvexError("Spotify credentials are not configured.");
    }

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        redirect_uri: args.redirectUri,
        code_verifier: args.codeVerifier,
      }),
    });

    if (!response.ok) {
      throw new ConvexError(
        `Spotify authentication failed (${response.status}).`,
      );
    }

    const tokens: {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    } = await response.json();

    if (!tokens.refresh_token) {
      throw new ConvexError("Spotify did not provide a refresh token.");
    }

    const encryptedAccessToken = await encryptSpotifyToken(tokens.access_token);

    const encryptedRefreshToken = await encryptSpotifyToken(
      tokens.refresh_token,
    );

    await ctx.runMutation(internal.spotifyConnections.saveConnection, {
      userId,
      encryptedAccessToken,
      encryptedRefreshToken,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    return { success: true };
  },
});
type SpotifyTrack = {
  id?: string;
  name?: string;
  type?: string;
  is_local?: boolean;
  artists?: Array<{ name: string }>;
  album?: { images?: Array<{ url: string }> };
};

type PlaylistPage = {
  total?: number;
  items?: Array<{
    item?: SpotifyTrack | null;
    track?: SpotifyTrack | null;
  }>;
};

function playlistId(link: string): string | null {
  try {
    const url = new URL(link.trim());
    if (!["open.spotify.com", "www.open.spotify.com"].includes(url.hostname)) {
      return null;
    }

    return (
      url.pathname.match(
        /^\/(?:intl-[a-zA-Z-]+\/)?playlist\/([a-zA-Z0-9]+)\/?$/,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

export const importPlaylist = action({
  args: { link: v.string() },

  handler: async (ctx, { link }) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new ConvexError("You must be signed in.");
    }

    const id = playlistId(link);
    if (!id) {
      throw new ConvexError("Please paste a valid Spotify playlist URL.");
    }

    const connection = await ctx.runQuery(
      internal.spotifyConnections.getStoredConnection,
      { userId },
    );

    if (!connection) {
      throw new ConvexError("Connect your Spotify account first.");
    }

    let accessToken = await decryptSpotifyToken(
      connection.encryptedAccessToken,
    );

    if (connection.expiresAt <= Date.now() + 60_000) {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new ConvexError("Spotify credentials are not configured.");
      }

      const refreshToken = await decryptSpotifyToken(
        connection.encryptedRefreshToken,
      );

      const refreshResponse = await fetch(
        "https://accounts.spotify.com/api/token",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        },
      );

      if (!refreshResponse.ok) {
        throw new ConvexError(
          `Spotify token refresh failed (${refreshResponse.status}). Please reconnect Spotify if authorization has expired.`,
        );
      }

      const refreshed: {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      } = await refreshResponse.json();

      accessToken = refreshed.access_token;

      const updated = await ctx.runMutation(
        internal.spotifyConnections.updateRefreshedConnection,
        {
          connectionId: connection._id,
          expectedUpdatedAt: connection.updatedAt,
          encryptedAccessToken: await encryptSpotifyToken(
            refreshed.access_token,
          ),
          encryptedRefreshToken: await encryptSpotifyToken(
            refreshed.refresh_token ?? refreshToken,
          ),
          expiresAt: Date.now() + refreshed.expires_in * 1000,
        },
      );

      if (!updated) {
        throw new ConvexError(
          "Spotify connection changed during refresh. Please try again.",
        );
      }
    }

    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    const metadataResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${id}?fields=name`,
      { headers },
    );

    if (!metadataResponse.ok) {
      throw new ConvexError(
        `Spotify playlist unavailable (${metadataResponse.status}).`,
      );
    }

    const metadata: { name?: string } = await metadataResponse.json();

    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${id}/items?limit=50&offset=0`,
      { headers },
    );

    if (!response.ok) {
      throw new ConvexError(
        `Spotify denied access to playlist songs (${response.status}).`,
      );
    }

    const page: PlaylistPage = await response.json();
    const seen = new Set<string>();

    const songs = (page.items ?? []).flatMap((entry) => {
      const track = entry.item ?? entry.track;

      if (
        !track?.id ||
        !track.name ||
        track.is_local ||
        (track.type && track.type !== "track") ||
        seen.has(track.id)
      ) {
        return [];
      }

      seen.add(track.id);

      return [
        {
          title: track.name,
          artist: (track.artists ?? []).map((artist) => artist.name).join(", "),
          link: `https://open.spotify.com/track/${track.id}`,
          albumArtUrl: track.album?.images?.[0]?.url,
        },
      ];
    });

    return {
      name: metadata.name ?? "Spotify playlist",
      songs,
      total: page.total ?? songs.length,
      limited: (page.total ?? 0) > 50,
    };
  },
});
