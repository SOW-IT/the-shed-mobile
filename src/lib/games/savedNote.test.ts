import { describe, expect, test } from "vitest";
import { savedNote } from "./savedNote";

describe("the game-over saved note", () => {
  test("online and signed in, the score is on the leaderboard", () => {
    expect(savedNote({ signedIn: true, offline: false })).toBe("Saved to the leaderboard.");
  });

  test("offline and signed in, it waits until the app is online", () => {
    expect(savedNote({ signedIn: true, offline: true })).toBe("Saved. It goes on the leaderboard when you're online.");
  });

  test("signed out, it waits for a sign-in whether or not the app is online", () => {
    const signedOut = "Saved on this device. Sign in and it goes on the leaderboard.";
    expect(savedNote({ signedIn: false, offline: false })).toBe(signedOut);
    expect(savedNote({ signedIn: false, offline: true })).toBe(signedOut);
  });
});
