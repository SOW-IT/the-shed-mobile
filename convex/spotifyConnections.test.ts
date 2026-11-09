/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { decryptSpotifyToken, encryptSpotifyToken } from "./spotifyCrypto";

const modules = import.meta.glob("./**/*.ts");

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
const PLAYLIST = "https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd?si=x";
const REDIRECT = "theshedmobile://spotify-callback";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  vi.stubEnv("SPOTIFY_TOKEN_ENCRYPTION_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert("users", { email: "hana@sow.org.au" }));
  const as = t.withIdentity({ subject: `${userId}|session`, issuer: "test" });
  return { t, userId, as };
}

const storedConnection = (t: TestConvex<typeof schema>, userId: Id<"users">) =>
  t.run((ctx) =>
    ctx.db
      .query("spotifyConnections")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first(),
  );

async function connectWith(
  t: TestConvex<typeof schema>,
  userId: Id<"users">,
  expiresAt: number,
) {
  await t.mutation(internal.spotifyConnections.saveConnection, {
    userId,
    encryptedAccessToken: await encryptSpotifyToken("access-1"),
    encryptedRefreshToken: await encryptSpotifyToken("refresh-1"),
    expiresAt,
  });
}

describe("spotifyCrypto", () => {
  test("round-trips a token and refuses bad keys or data", async () => {
    expect(await decryptSpotifyToken(await encryptSpotifyToken("secret-token"))).toBe(
      "secret-token",
    );
    await expect(decryptSpotifyToken(btoa("short"))).rejects.toThrow(
      "Invalid encrypted Spotify token.",
    );
    vi.stubEnv("SPOTIFY_TOKEN_ENCRYPTION_KEY", btoa("too short"));
    await expect(encryptSpotifyToken("x")).rejects.toThrow("must be 32 bytes");
    vi.stubEnv("SPOTIFY_TOKEN_ENCRYPTION_KEY", "");
    await expect(encryptSpotifyToken("x")).rejects.toThrow("not configured");
  });
});

describe("Spotify connection", () => {
  test("client ID, connection status and disconnect", async () => {
    const { t, userId, as } = await setup();
    expect(await t.query(api.spotifyConnections.getClientId, {})).toBe("client");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    expect(await t.query(api.spotifyConnections.getClientId, {})).toBe("");

    expect(await t.query(api.spotifyConnections.getConnection, {})).toEqual({ connected: false });
    expect(await as.query(api.spotifyConnections.getConnection, {})).toEqual({ connected: false });
    await connectWith(t, userId, Date.now() + 3_600_000);
    expect(await as.query(api.spotifyConnections.getConnection, {})).toEqual({ connected: true });

    await expect(t.mutation(api.spotifyConnections.disconnect, {})).rejects.toThrow(
      "You must be signed in.",
    );
    expect(await as.mutation(api.spotifyConnections.disconnect, {})).toEqual({ success: true });
    expect(await storedConnection(t, userId)).toBeNull();
  });

  test("saving again updates the one row, and a refresh only wins if nothing changed", async () => {
    const { t, userId } = await setup();
    await connectWith(t, userId, 1);
    const first = (await storedConnection(t, userId))!;
    await connectWith(t, userId, 2);
    const second = (await storedConnection(t, userId))!;
    expect(second._id).toBe(first._id);
    expect(second.expiresAt).toBe(2);

    const refresh = {
      connectionId: second._id,
      encryptedAccessToken: "a",
      encryptedRefreshToken: "r",
      expiresAt: 3,
    };
    expect(
      await t.mutation(internal.spotifyConnections.updateRefreshedConnection, {
        ...refresh,
        expectedUpdatedAt: second.updatedAt - 1,
      }),
    ).toBe(false);
    expect(
      await t.mutation(internal.spotifyConnections.updateRefreshedConnection, {
        ...refresh,
        expectedUpdatedAt: second.updatedAt,
      }),
    ).toBe(true);
    expect((await storedConnection(t, userId))!.expiresAt).toBe(3);
  });

  test("connect exchanges the code and stores encrypted tokens", async () => {
    const { t, userId, as } = await setup();
    const args = { code: "c", codeVerifier: "v", redirectUri: REDIRECT };
    await expect(t.action(api.spotifyConnections.connect, args)).rejects.toThrow(
      "You must be signed in.",
    );
    await expect(
      as.action(api.spotifyConnections.connect, { ...args, redirectUri: "https://evil.example" }),
    ).rejects.toThrow("Invalid Spotify redirect URI.");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    await expect(as.action(api.spotifyConnections.connect, args)).rejects.toThrow(
      "Spotify credentials are not configured.",
    );
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    fetchMock.mockResolvedValueOnce(json({}, 400));
    await expect(as.action(api.spotifyConnections.connect, args)).rejects.toThrow(
      "Spotify authentication failed (400).",
    );
    fetchMock.mockResolvedValueOnce(json({ access_token: "a", expires_in: 3600 }));
    await expect(as.action(api.spotifyConnections.connect, args)).rejects.toThrow(
      "Spotify did not provide a refresh token.",
    );

    fetchMock.mockResolvedValueOnce(
      json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 3600 }),
    );
    expect(await as.action(api.spotifyConnections.connect, args)).toEqual({ success: true });
    const row = (await storedConnection(t, userId))!;
    expect(row.encryptedAccessToken).not.toContain("access-2");
    expect(await decryptSpotifyToken(row.encryptedRefreshToken)).toBe("refresh-2");
  });

  test("connect fails if the account is deleted while Spotify answers", async () => {
    const { t, userId, as } = await setup();
    fetchMock.mockImplementationOnce(async () => {
      await t.run((ctx) => ctx.db.delete("users", userId));
      return json({ access_token: "a", refresh_token: "r", expires_in: 3600 });
    });

    await expect(
      as.action(api.spotifyConnections.connect, {
        code: "c",
        codeVerifier: "v",
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow("Your account was deleted, so Spotify wasn't connected.");
    expect(await storedConnection(t, userId)).toBeNull();
  });
});

describe("spotifyConnections.importPlaylist", () => {
  const items = {
    total: 60,
    items: [
      {
        item: {
          id: "t1",
          name: "Morning Light",
          type: "track",
          artists: [{ name: "Hana Doe" }],
          album: { images: [{ url: "https://i.scdn.co/a" }] },
          external_ids: { isrc: "USABC2400001" },
        },
      },
      { track: { id: "t2", name: "Still Waters" } },
      { item: { id: "t1", name: "Morning Light" } },
      { item: { id: "t3", name: "Local", is_local: true } },
      { item: { id: "t4", name: "Episode", type: "episode" } },
      { item: { name: "No id" } },
      { item: null },
    ],
  };

  test("lists the playlist's tracks once each, with their ISRC", async () => {
    const { t, userId, as } = await setup();
    await connectWith(t, userId, Date.now() + 3_600_000);
    fetchMock.mockResolvedValueOnce(json({ name: "Sunday" })).mockResolvedValueOnce(json(items));
    expect(await as.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST })).toEqual({
      name: "Sunday",
      total: 60,
      limited: true,
      songs: [
        {
          title: "Morning Light",
          artist: "Hana Doe",
          link: "https://open.spotify.com/track/t1",
          albumArtUrl: "https://i.scdn.co/a",
          isrc: "USABC2400001",
        },
        {
          title: "Still Waters",
          artist: "",
          link: "https://open.spotify.com/track/t2",
          albumArtUrl: undefined,
          isrc: undefined,
        },
      ],
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer access-1");
  });

  test("an unnamed playlist without a total", async () => {
    const { t, userId, as } = await setup();
    await connectWith(t, userId, Date.now() + 3_600_000);
    fetchMock.mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}));
    expect(await as.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST })).toEqual({
      name: "Spotify playlist",
      songs: [],
      total: 0,
      limited: false,
    });
  });

  test("refreshes an expiring token first and keeps the old refresh token if none is sent", async () => {
    const { t, userId, as } = await setup();
    await connectWith(t, userId, Date.now());
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "access-2", expires_in: 3600 }))
      .mockResolvedValueOnce(json({ name: "Sunday" }))
      .mockResolvedValueOnce(json({ items: [] }));
    await as.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer access-2");
    const row = (await storedConnection(t, userId))!;
    expect(await decryptSpotifyToken(row.encryptedAccessToken)).toBe("access-2");
    expect(await decryptSpotifyToken(row.encryptedRefreshToken)).toBe("refresh-1");

    await connectWith(t, userId, Date.now());
    fetchMock
      .mockResolvedValueOnce(
        json({ access_token: "access-3", refresh_token: "refresh-3", expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ name: "Sunday" }))
      .mockResolvedValueOnce(json({ items: [] }));
    await as.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST });
    expect(
      await decryptSpotifyToken((await storedConnection(t, userId))!.encryptedRefreshToken),
    ).toBe("refresh-3");
  });

  test("explains each way it can fail", async () => {
    const { t, userId, as } = await setup();
    const run = () => as.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST });
    await expect(
      t.action(api.spotifyConnections.importPlaylist, { link: PLAYLIST }),
    ).rejects.toThrow("You must be signed in.");
    for (const link of ["nope", "https://example.com/playlist/x", "https://open.spotify.com/track/x"]) {
      await expect(
        as.action(api.spotifyConnections.importPlaylist, { link }),
      ).rejects.toThrow("Please paste a valid Spotify playlist URL.");
    }
    await expect(run()).rejects.toThrow("Connect your Spotify account first.");

    await connectWith(t, userId, Date.now());
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    await expect(run()).rejects.toThrow("Spotify credentials are not configured.");
    vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
    fetchMock.mockResolvedValueOnce(json({}, 400));
    await expect(run()).rejects.toThrow("Spotify token refresh failed (400).");

    // Another import refreshed the token while this one waited.
    fetchMock.mockImplementationOnce(async () => {
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("spotifyConnections")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .first();
        await ctx.db.patch(row!._id, { updatedAt: row!.updatedAt + 1 });
      });
      return json({ access_token: "a", expires_in: 3600 });
    });
    await expect(run()).rejects.toThrow("Spotify connection changed during refresh.");

    await connectWith(t, userId, Date.now() + 3_600_000);
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(run()).rejects.toThrow("Spotify playlist unavailable (404).");
    fetchMock.mockResolvedValueOnce(json({ name: "x" })).mockResolvedValueOnce(json({}, 403));
    await expect(run()).rejects.toThrow("Spotify denied access to playlist songs (403).");
  });
});
