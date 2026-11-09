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
    expect(
      parseYouTubeSong("Still Waters (Video) - Alex Morgan", "Some Channel"),
    ).toEqual({ title: "Still Waters", artist: "Alex Morgan" });
    expect(
      parseYouTubeSong("Alex Morgan - Still Waters (Official Video)", "Some Channel"),
    ).toEqual({ title: "Still Waters", artist: "Alex Morgan" });
  });

  test("an artist whose name contains a label word stays the artist", () => {
    expect(
      parseYouTubeSong("Official Video Game Orchestra - Still Waters", "Some Channel"),
    ).toEqual({ title: "Still Waters", artist: "Official Video Game Orchestra" });
    expect(parseYouTubeSong("Lyrics Born - Still Waters", "Some Channel")).toEqual({
      title: "Still Waters",
      artist: "Lyrics Born",
    });
  });

  test("a live or remastered version label doesn't put the song first", () => {
    expect(
      parseYouTubeSong("Hana Doe (Live) - Morning Light", "Some Channel"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
    expect(
      parseYouTubeSong("Hana Doe [Remastered] - Morning Light", "Some Channel"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
    expect(
      parseYouTubeSong("Morning Light (Official Video) (Live) - Hana Doe", "Some Channel"),
    ).toEqual({ title: "Morning Light", artist: "Hana Doe" });
  });

  test("matches non-Latin channel names", () => {
    expect(parseYouTubeSong("아침빛 (Official Audio) - 한나", "한나 - Topic")).toEqual({
      title: "아침빛",
      artist: "한나",
    });
    expect(parseYouTubeSong("한나 - 아침빛", "한나")).toEqual({
      title: "아침빛",
      artist: "한나",
    });
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
