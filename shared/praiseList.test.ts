import { describe, expect, it } from "vitest";
import { SONGS_COUNTED, songsToReviewLabel } from "./praiseList";

describe("songsToReviewLabel", () => {
  it("counts songs up to the cap and says over it beyond", () => {
    expect(songsToReviewLabel(1)).toBe("1 song to review");
    expect(songsToReviewLabel(SONGS_COUNTED)).toBe("100 songs to review");
    expect(songsToReviewLabel(SONGS_COUNTED + 1)).toBe("Over 100 songs to review");
  });
});
