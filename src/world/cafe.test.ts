import { describe, expect, test } from "vitest";
import {
  challengeTitle,
  gameIcon,
  gameLabel,
  playingByPerson,
  rematchWords,
  resultWords,
  secondsLeft,
  shownChallenge,
  turnWords,
  type CafeChallengeView,
} from "./cafe";

const prompt = (over: Partial<CafeChallengeView> = {}): CafeChallengeView => ({
  id: "c1",
  other: "kate",
  otherName: "Kate R.",
  picked: "nobody",
  table: "table-a",
  expiresAt: 1000,
  ...over,
});

const seated = [
  { memberId: "me", isMe: true, seat: "table-a-left" },
  { memberId: "kate", isMe: false, seat: "table-a-right" },
];
const none = new Set<string>();

describe("which challenge shows", () => {
  test("a table prompt shows while both are still at that table and it hasn't run out", () => {
    expect(shownChallenge([prompt()], { now: 0, people: seated, dismissed: none })?.id).toBe("c1");
    expect(shownChallenge([prompt()], { now: 1000, people: seated, dismissed: none })).toBeNull();
    const stood = [seated[0], { memberId: "kate", isMe: false }];
    expect(shownChallenge([prompt()], { now: 0, people: stood, dismissed: none })).toBeNull();
    expect(shownChallenge([prompt()], { now: 0, people: [{ memberId: "me", isMe: true }], dismissed: none })).toBeNull();
  });

  test("once a game is picked it shows wherever they are, unless dismissed; one picked by them comes first", () => {
    const picked = prompt({ id: "c2", picked: "me", kind: "fourInARow" });
    const theirs = prompt({ id: "c3", picked: "them", kind: "ticTacToe", table: undefined });
    expect(shownChallenge([picked], { now: 0, people: [], dismissed: none })?.id).toBe("c2");
    expect(shownChallenge([picked, theirs], { now: 0, people: [], dismissed: none })?.id).toBe("c3");
    expect(shownChallenge([picked], { now: 0, people: [], dismissed: new Set(["c2:me"]) })).toBeNull();
    expect(shownChallenge([prompt({ other: null, picked: "them" })], { now: 0, people: [], dismissed: none })).toBeNull();
  });

  test("titles and labels", () => {
    expect(challengeTitle(prompt())).toBe("Play Kate R.?");
    expect(challengeTitle(prompt({ picked: "me" }))).toBe("Asked Kate R.");
    expect(challengeTitle(prompt({ picked: "them" }))).toBe("Kate R. wants to play");
    expect(gameLabel("fiveInARow")).toBe("Five in a Row");
    expect(gameLabel(undefined)).toBe("a game");
    expect(gameIcon("dotsAndBoxes")).toBe("🔲");
    expect(gameIcon("old")).toBe("🎲");
  });
});

describe("what others see", () => {
  test("both players get a tag naming the other and a People line", () => {
    const names: Record<string, string> = { a: "Anna B.", b: "Kate R." };
    const { tags, lines } = playingByPerson([{ a: "a", b: "b", kind: "fourInARow" }], (id) => names[id]);
    expect(tags.get("a")).toEqual({ tag: "🔴 Four in a Row vs Kate R.", icon: "🔴", with: "b" });
    expect(tags.get("b")?.tag).toBe("🔴 Four in a Row vs Anna B.");
    expect(lines.get("b")).toBe("Playing Four in a Row");
    expect(tags.get("c")).toBeUndefined();
  });
});

describe("words on the board", () => {
  test("results say who won and why", () => {
    expect(resultWords({ winner: "a", why: "played" }, "a", "Kate R.")).toEqual({ title: "You win", detail: null, won: true });
    expect(resultWords({ winner: "b", why: "timeout" }, "a", "Kate R.")).toEqual({ title: "Kate R. wins", detail: "You ran out of time.", won: false });
    expect(resultWords({ winner: "a", why: "left" }, "a", "Kate R.").detail).toBe("Kate R. left the Café.");
    expect(resultWords({ winner: "a", why: "gaveUp" }, "a", "Kate R.").detail).toBe("Kate R. gave up.");
    expect(resultWords({ winner: "draw", why: "abandoned" }, "a", "Kate R.")).toEqual({ title: "Draw", detail: "You both left.", won: false });
  });

  test("turns, seconds and rematches", () => {
    expect(turnWords("a", "a", "Kate R.")).toBe("Your turn");
    expect(turnWords("b", "a", "Kate R.")).toBe("Kate R.'s turn");
    expect(secondsLeft(30_000, 100)).toBe(30);
    expect(secondsLeft(100, 30_000)).toBe(0);
    expect(rematchWords(undefined, "a", "Kate R.")).toBeNull();
    expect(rematchWords("a", "a", "Kate R.")).toBe("Waiting for Kate R.");
    expect(rematchWords("b", "a", "Kate R.")).toBe("Kate R. wants a rematch");
  });
});
