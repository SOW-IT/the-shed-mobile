/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const TRACK = "https://open.spotify.com/intl-en/track/3cmaB3jaMbVLVbXwTkzaew?si=x";
const PLAYLIST = "https://www.youtube.com/playlist?list=PLabc_123-XYZ";

const signedIn = () =>
  convexTest(schema, modules).withIdentity({ subject: "user1|session1", issuer: "test" });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  vi.stubEnv("YOUTUBE_API_KEY", "key");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("spotify.getTrack", () => {
  test("returns the song's details with a clean link", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(
        json({
          name: "Morning Light",
          artists: [{ name: "Hana Doe" }, { name: "Alex Morgan" }],
          album: { images: [{ url: "https://i.scdn.co/image/a" }] },
          external_ids: { isrc: "USABC2400001" },
        }),
      );
    expect(await signedIn().action(api.spotify.getTrack, { link: TRACK })).toEqual({
      title: "Morning Light",
      artist: "Hana Doe, Alex Morgan",
      albumArtUrl: "https://i.scdn.co/image/a",
      link: "https://open.spotify.com/track/3cmaB3jaMbVLVbXwTkzaew",
      isrc: "USABC2400001",
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.spotify.com/v1/tracks/3cmaB3jaMbVLVbXwTkzaew",
    );
  });

  test("a track with no artwork or ISRC", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(json({ name: "Song", artists: [], album: { images: [] } }));
    expect(await signedIn().action(api.spotify.getTrack, { link: TRACK })).toMatchObject({
      albumArtUrl: null,
      isrc: null,
    });
  });

  test("rejects links that aren't Spotify tracks, before calling Spotify", async () => {
    const t = signedIn();
    for (const link of [
      "not a url",
      "https://example.com/track/abc",
      "https://open.spotify.com/playlist/abc",
    ]) {
      await expect(t.action(api.spotify.getTrack, { link })).rejects.toThrow(
        "Invalid Spotify track URL.",
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("says what failed: credentials, sign-in to Spotify, or the lookup", async () => {
    const t = signedIn();
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
    await expect(t.action(api.spotify.getTrack, { link: TRACK })).rejects.toThrow(
      "Spotify credentials are not configured.",
    );
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    fetchMock.mockResolvedValueOnce(json({}, 400));
    await expect(t.action(api.spotify.getTrack, { link: TRACK })).rejects.toThrow(
      "Spotify authentication failed (400).",
    );
    fetchMock
      .mockResolvedValueOnce(json({ access_token: "token" }))
      .mockResolvedValueOnce(json({}, 404));
    await expect(t.action(api.spotify.getTrack, { link: TRACK })).rejects.toThrow(
      "Spotify track lookup failed (404).",
    );
  });
});

describe("spotify.searchTracks", () => {
  test("lists matching Australian tracks with art, link, ISRC and release date", async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: "token" })).mockResolvedValueOnce(
      json({
        tracks: {
          items: [
            {
              id: "t1",
              name: "Morning Light",
              artists: [{ name: "Hana Doe" }, { name: "Alex Morgan" }],
              album: {
                release_date: "2021-04-09",
                images: [
                  { url: "https://i.scdn.co/image/big", width: 640 },
                  { url: "https://i.scdn.co/image/small", width: 64 },
                  { url: "https://i.scdn.co/image/mid", width: 300 },
                ],
              },
              external_ids: { isrc: "USABC2400001" },
            },
            { id: "t2", name: "Bare", artists: [], album: { images: [] } },
            { id: "t3", name: "Local", artists: [], album: { images: [] }, is_local: true },
            { name: "No id", artists: [], album: { images: [] } },
            null,
          ],
        },
      }),
    );
    expect(await signedIn().action(api.spotify.searchTracks, { query: "  morning light " })).toEqual([
      {
        title: "Morning Light",
        artist: "Hana Doe, Alex Morgan",
        albumArtUrl: "https://i.scdn.co/image/big",
        thumbnailUrl: "https://i.scdn.co/image/small",
        link: "https://open.spotify.com/track/t1",
        isrc: "USABC2400001",
        releaseDate: "2021-04-09",
      },
      {
        title: "Bare",
        artist: "",
        albumArtUrl: null,
        thumbnailUrl: null,
        link: "https://open.spotify.com/track/t2",
        isrc: null,
        releaseDate: null,
      },
    ]);
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.origin + url.pathname).toBe("https://api.spotify.com/v1/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "morning light",
      type: "track",
      limit: "10",
      market: "AU",
    });
  });

  test("a short search returns nothing without calling Spotify", async () => {
    expect(await signedIn().action(api.spotify.searchTracks, { query: " a " })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an empty response, a long search, signed out, or Spotify refusing", async () => {
    const t = signedIn();
    fetchMock.mockResolvedValueOnce(json({ access_token: "token" })).mockResolvedValueOnce(json({}));
    expect(await t.action(api.spotify.searchTracks, { query: "nothing here" })).toEqual([]);
    await expect(t.action(api.spotify.searchTracks, { query: "x".repeat(101) })).rejects.toThrow(
      "Search for 100 characters or fewer.",
    );
    await expect(
      convexTest(schema, modules).action(api.spotify.searchTracks, { query: "morning" }),
    ).rejects.toThrow("You must be signed in.");
    fetchMock.mockResolvedValueOnce(json({ access_token: "token" })).mockResolvedValueOnce(json({}, 429));
    await expect(t.action(api.spotify.searchTracks, { query: "morning" })).rejects.toThrow(
      "Spotify search failed (429).",
    );
  });
});

describe("youtube.importPlaylist", () => {
  test("lists the playlist's public videos as songs", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        nextPageToken: "more",
        items: [
          {
            snippet: {
              title: "Hana Doe - Morning Light (Official Audio)",
              videoOwnerChannelTitle: "Hana Doe - Topic",
              resourceId: { videoId: "abcdefghijk" },
              thumbnails: { high: { url: "https://i.ytimg.com/high.jpg" } },
            },
          },
          {
            snippet: {
              title: "Still Waters",
              channelTitle: "Alex Morgan",
              resourceId: { videoId: "bcdefghijkl" },
              thumbnails: { default: { url: "https://i.ytimg.com/default.jpg" } },
            },
          },
          { snippet: { resourceId: { videoId: "cdefghijklm" } } },
          { snippet: { title: "Private video", resourceId: { videoId: "x" } } },
          { snippet: { title: "Deleted video", resourceId: { videoId: "y" } } },
          { snippet: { title: "Hidden", resourceId: { videoId: "z" } }, status: { privacyStatus: "private" } },
          { snippet: { title: "No id" } },
        ],
      }),
    );
    const result = await signedIn().action(api.youtube.importPlaylist, { link: PLAYLIST });
    expect(result).toEqual({
      name: "YouTube playlist",
      limited: true,
      songs: [
        {
          title: "Morning Light",
          artist: "Hana Doe",
          link: "https://www.youtube.com/watch?v=abcdefghijk",
          albumArtUrl: "https://i.ytimg.com/high.jpg",
        },
        {
          title: "Still Waters",
          artist: "Alex Morgan",
          link: "https://www.youtube.com/watch?v=bcdefghijkl",
          albumArtUrl: "https://i.ytimg.com/default.jpg",
        },
        {
          title: "Unknown song",
          artist: "Unknown artist",
          link: "https://www.youtube.com/watch?v=cdefghijklm",
          albumArtUrl: undefined,
        },
      ],
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("playlistId")).toBe("PLabc_123-XYZ");
  });

  test("an empty playlist on its only page", async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await signedIn().action(api.youtube.importPlaylist, { link: PLAYLIST })).toEqual({
      name: "YouTube playlist",
      songs: [],
      limited: false,
    });
  });

  test("rejects links that aren't YouTube playlists", async () => {
    const t = signedIn();
    for (const [link, message] of [
      ["not a url", "Please enter a valid YouTube playlist URL."],
      ["https://example.com/playlist?list=PL1", "Please enter a valid YouTube playlist URL."],
      ["https://www.youtube.com/watch?v=abcdefghijk", "Invalid YouTube playlist ID."],
      ["https://music.youtube.com/playlist?list=bad!id", "Invalid YouTube playlist ID."],
    ]) {
      await expect(t.action(api.youtube.importPlaylist, { link })).rejects.toThrow(message);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("explains a missing key, a private playlist and other failures", async () => {
    const t = signedIn();
    vi.stubEnv("YOUTUBE_API_KEY", "");
    await expect(t.action(api.youtube.importPlaylist, { link: PLAYLIST })).rejects.toThrow(
      "YouTube API key is not configured.",
    );
    vi.stubEnv("YOUTUBE_API_KEY", "key");
    fetchMock.mockResolvedValueOnce(json({}, 404));
    await expect(t.action(api.youtube.importPlaylist, { link: PLAYLIST })).rejects.toThrow(
      "This playlist is unavailable.",
    );
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await expect(t.action(api.youtube.importPlaylist, { link: PLAYLIST })).rejects.toThrow(
      "YouTube playlist request failed (500).",
    );
  });
});
