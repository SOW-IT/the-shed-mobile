import { describe, expect, it } from "vitest";
import { releaseDateLabel, SONGS_COUNTED, songServiceLabel, songsToReviewLabel } from "./praiseList";

describe("songsToReviewLabel", () => {
  it("counts songs up to the cap and says over it beyond", () => {
    expect(songsToReviewLabel(1)).toBe("1 song to review");
    expect(songsToReviewLabel(SONGS_COUNTED)).toBe("100 songs to review");
    expect(songsToReviewLabel(SONGS_COUNTED + 1)).toBe("Over 100 songs to review");
  });
});

describe("releaseDateLabel", () => {
  it("shows a Spotify release date at the precision Spotify gives", () => {
    expect(releaseDateLabel("2012-07-09")).toBe("9 Jul 2012");
    expect(releaseDateLabel("2014-03")).toBe("Mar 2014");
    expect(releaseDateLabel("2001")).toBe("2001");
    expect(releaseDateLabel("2001-13")).toBe("2001");
    expect(releaseDateLabel(undefined)).toBeNull();
    expect(releaseDateLabel("soon")).toBeNull();
  });
});

describe("songServiceLabel", () => {
  it("names the app a song link opens in", () => {
    expect(songServiceLabel("https://open.spotify.com/track/x")).toBe("Open in Spotify");
    expect(songServiceLabel("https://www.youtube.com/watch?v=x")).toBe("Open in YouTube");
    expect(songServiceLabel("https://youtu.be/x")).toBe("Open in YouTube");
    expect(songServiceLabel("https://example.com/x")).toBe("Open link");
    expect(songServiceLabel("not a link")).toBe("Open link");
  });
});
