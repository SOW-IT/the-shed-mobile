import { describe, expect, test } from "vitest";
import { cleanYouTubeTitle, parseYouTubeSong } from "./youtube";

describe("parseYouTubeSong", () => {
  test("drops '(Official Video)' and '(4K Remaster)' labels", () => {
    expect(
      parseYouTubeSong(
        "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)",
        "Rick Astley",
      ),
    ).toEqual({ title: "Never Gonna Give You Up", artist: "Rick Astley" });
    expect(
      parseYouTubeSong("Morning Light (Official Video) - Hana Doe", "Some Channel"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
    expect(
      parseYouTubeSong("Morning Light Official Video - Hana Doe", "Some Channel"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
    expect(parseYouTubeSong("Morning Light Official Audio", "Hana Doe")).toEqual({
      title: "Morning Light",
      artist: "Hana Doe",
    });
    expect(parseYouTubeSong("Morning Light [Remastered]", "Hana Doe")).toEqual({
      title: "Morning Light",
      artist: "Hana Doe",
    });
  });

  test("drops the ' - Topic' from YouTube Music's auto-generated channels", () => {
    expect(parseYouTubeSong("Morning Light", "Hana Doe - Topic")).toEqual({
      title: "Morning Light",
      artist: "Hana Doe",
    });
  });

  test("uses the side that matches the channel as the artist", () => {
    expect(
      parseYouTubeSong("Morning Light - Hana Doe (Official Lyric Video)", "Hana Doe"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
    expect(parseYouTubeSong("Hana Doe - Morning Light", "HANA DOE")).toEqual({
      title: "Morning Light",
      artist: "Hana Doe",
    });
  });

  test("reads 'Artist - Song' unless the first part carries a video label", () => {
    expect(parseYouTubeSong("Alex Morgan - Still Waters", "Some Channel")).toEqual({
      title: "Still Waters",
      artist: "Alex Morgan",
    });
    expect(
      parseYouTubeSong("Still Waters Lyric Video - Alex Morgan", "Some Channel"),
    ).toEqual({ title: "Still Waters", artist: "Alex Morgan" });
  });

  test("keeps the whole title and the channel when the title has no single split", () => {
    expect(parseYouTubeSong("Still Waters [Live]", "")).toEqual({
      title: "Still Waters",
      artist: "Unknown artist",
    });
  });
});

describe("cleanYouTubeTitle", () => {
  test("removes video labels and the artist's name from either end", () => {
    expect(cleanYouTubeTitle("Hana Doe - Morning Light (Audio)", "Hana Doe")).toBe(
      "Morning Light",
    );
    expect(cleanYouTubeTitle("Morning Light | Hana Doe", "Hana Doe")).toBe(
      "Morning Light",
    );
    expect(cleanYouTubeTitle("Morning Light - Official Music Video", "")).toBe(
      "Morning Light",
    );
    expect(cleanYouTubeTitle("Hana Doe", "Hana Doe")).toBe("Hana Doe");
  });
});
