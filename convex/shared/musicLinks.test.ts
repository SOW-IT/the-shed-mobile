import { describe, expect, test } from "vitest";
import {
  songArtworkUrl,
  songLinkKey,
  spotifyTrackId,
  youtubeVideoId,
} from "./musicLinks";

describe("music links", () => {
  test("reads a YouTube video ID from every link form", () => {
    for (const link of [
      "https://www.youtube.com/watch?v=abcdefghijk&list=PL1",
      "https://youtube.com/watch?v=abcdefghijk",
      "https://m.youtube.com/watch?v=abcdefghijk",
      "https://music.youtube.com/watch?v=abcdefghijk",
      "https://youtu.be/abcdefghijk?si=x",
      "https://www.youtube.com/shorts/abcdefghijk",
      "https://www.youtube.com/live/abcdefghijk",
      "https://www.youtube.com/embed/abcdefghijk",
      "https://www.youtube.com/shorts/abcdefghijk/",
      " http://youtu.be/abcdefghijk ",
    ]) {
      expect(youtubeVideoId(link)).toBe("abcdefghijk");
    }
  });

  test("ignores links that aren't a YouTube video", () => {
    for (const link of [
      "https://www.youtube.com/playlist?list=PL1",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/shorts/abcdefghijkl",
      "https://www.youtube.com/embed/abcdefghijk-x",
      "https://example.com/watch?v=abcdefghijk",
      "ftp://youtu.be/abcdefghijk",
      "not a link",
    ]) {
      expect(youtubeVideoId(link)).toBeNull();
    }
  });

  test("reads Spotify track IDs from http and https links", () => {
    expect(
      spotifyTrackId("https://open.spotify.com/intl-de/track/abc123?si=1"),
    ).toBe("abc123");
    expect(spotifyTrackId("http://open.spotify.com/track/abc123")).toBe(
      "abc123",
    );
    expect(spotifyTrackId("ftp://open.spotify.com/track/abc123")).toBeNull();
    expect(spotifyTrackId("https://open.spotify.com/album/abc123")).toBeNull();
  });

  test("gives the same key to two links for one song", () => {
    expect(songLinkKey("https://youtu.be/abcdefghijk")).toBe(
      songLinkKey("https://www.youtube.com/watch?v=abcdefghijk&t=3"),
    );
    expect(songLinkKey("https://open.spotify.com/track/abc?si=1")).toBe(
      songLinkKey("https://open.spotify.com/intl-fr/track/abc"),
    );
    expect(songLinkKey("http://open.spotify.com/track/abc")).toBe(
      songLinkKey("https://open.spotify.com/track/abc"),
    );
    expect(songLinkKey(" https://Example.COM/Song?id=AbC ")).toBe(
      "https://example.com/Song?id=AbC",
    );
    expect(songLinkKey("https://example.com/Song")).not.toBe(
      songLinkKey("https://example.com/song"),
    );
    expect(songLinkKey(" not a link ")).toBe("not a link");
  });

  test("keeps artwork only from the song's own service", () => {
    expect(songArtworkUrl("https://youtu.be/abcdefghijk", undefined)).toBe(
      "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
    );
    expect(
      songArtworkUrl(
        "https://open.spotify.com/track/abc",
        "https://image-cdn-ak.spotifycdn.com/image/x",
      ),
    ).toBe("https://image-cdn-ak.spotifycdn.com/image/x");
    expect(
      songArtworkUrl(
        "https://open.spotify.com/track/abc",
        "http://i.scdn.co/image/x",
      ),
    ).toBeUndefined();
    expect(
      songArtworkUrl(
        "https://open.spotify.com/track/abc",
        "https://scdn.co.example.com/x",
      ),
    ).toBeUndefined();
    expect(
      songArtworkUrl("https://open.spotify.com/track/abc", "not a url"),
    ).toBeUndefined();
    expect(
      songArtworkUrl("https://open.spotify.com/track/abc", undefined),
    ).toBeUndefined();
  });
});
