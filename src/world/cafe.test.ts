import { describe, expect, test } from "vitest";
import {
  challengeTitle,
  gameIcon,
  gameLabel,
  gameToWatch,
  playingByPerson,
  rematchWords,
  resultWords,
  secondsLeft,
  freshSay,
  lowTimeDelay,
  lowTimeLevel,
  LOW_TIME_MS,
  shownChallenge,
  turnEdge,
  turnStarts,
  turnWords,
  watchersWords,
  watcherResultWords,
  watcherTurnWords,
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
    const { tags, lines } = playingByPerson([{ id: "g1", a: "a", b: "b", kind: "fourInARow" }], (id) => names[id]);
    expect(tags.get("a")).toEqual({ tag: "🔴 Four in a Row vs Kate R.", icon: "🔴", with: "b" });
    expect(tags.get("b")?.tag).toBe("🔴 Four in a Row vs Anna B.");
    expect(lines.get("b")).toBe("Playing Four in a Row");
    expect(tags.get("c")).toBeUndefined();
  });

  test("both players of an online game can be spectated; nobody else, offline players included", () => {
    const games = [{ id: "g1", a: "a", b: "b", kind: "ticTacToe" }];
    expect(gameToWatch(games, "a")).toBe("g1");
    expect(gameToWatch(games, "b")).toBe("g1");
    expect(gameToWatch(games, "offline")).toBeUndefined();
    expect(gameToWatch(games, undefined)).toBeUndefined();
    expect(gameToWatch([], "a")).toBeUndefined();
  });
});

describe("words for spectators", () => {
  const names = { a: "Anna B.", b: "Kate R." };
  test("the result names the winner and why, with nothing to rematch", () => {
    expect(watcherResultWords({ winner: "b", why: "played" }, names)).toEqual({ title: "Kate R. wins", detail: null, won: false });
    expect(watcherResultWords({ winner: "a", why: "timeout" }, names).detail).toBe("Kate R. ran out of time.");
    expect(watcherResultWords({ winner: "a", why: "left" }, names).detail).toBe("Kate R. left the Café.");
    expect(watcherResultWords({ winner: "b", why: "gaveUp" }, names).detail).toBe("Anna B. gave up.");
    expect(watcherResultWords({ winner: "draw", why: "played" }, names)).toEqual({ title: "Draw", detail: null, won: false });
    expect(watcherResultWords({ winner: "draw", why: "abandoned" }, names).detail).toBe("They both left.");
  });

  test("whose turn it is, and how many are watching", () => {
    expect(watcherTurnWords("b", names)).toBe("Kate R.'s turn");
    expect(watchersWords(1)).toBe("1 watching");
    expect(watchersWords(3)).toBe("3 watching");
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

describe("whose turn it is", () => {
  test("your colour edges the screen on your turn, none on theirs or once it's over", () => {
    const board = { turn: "a" as const };
    expect(turnEdge({ board }, "a")).toBe("mine");
    expect(turnEdge({ board }, "b")).toBe("theirs");
    expect(turnEdge({ board, result: { winner: "a", why: "played" } }, "a")).toBe("none");
  });

  test("a turn starts when it becomes yours, and again after theirs passes back without a move", () => {
    expect(turnStarts(null, { mine: true, endsAt: 60_000 })).toBe(true);
    expect(turnStarts(null, { mine: false, endsAt: 60_000 })).toBe(false);
    expect(turnStarts({ mine: false, endsAt: 60_000 }, { mine: true, endsAt: 61_000 })).toBe(true);
    expect(turnStarts({ mine: true, endsAt: 60_000 }, { mine: true, endsAt: 60_000 })).toBe(false);
    expect(turnStarts({ mine: true, endsAt: 60_000 }, { mine: true, endsAt: 121_000 })).toBe(true);
    expect(turnStarts({ mine: true, endsAt: 60_000 }, { mine: false, endsAt: 60_000 })).toBe(false);
  });
});

describe("low time", () => {
  test("the glow waits for the last 10 seconds of the 60", () => {
    expect(LOW_TIME_MS).toBe(10_000);
    expect(lowTimeDelay(60_000, 0)).toBe(50_000);
    expect(lowTimeDelay(60_000, 50_000)).toBe(0);
    expect(lowTimeDelay(60_000, 55_000)).toBe(0);
  });

  test("it grows from nothing to full as the time runs out", () => {
    expect(lowTimeLevel(60_000, 0)).toBe(0);
    expect(lowTimeLevel(60_000, 50_000)).toBe(0);
    expect(lowTimeLevel(60_000, 55_000)).toBe(0.5);
    expect(lowTimeLevel(60_000, 60_000)).toBe(1);
    expect(lowTimeLevel(60_000, 65_000)).toBe(1);
  });
});

describe("bubbles over the players", () => {
  test("a line shows while it's fresh, like the bubbles over heads", () => {
    const say = { text: "gg", at: 1000 };
    expect(freshSay(undefined, 1000, 8000)).toBeNull();
    expect(freshSay(say, 1000, 8000)).toBe("gg");
    expect(freshSay(say, 8999, 8000)).toBe("gg");
    expect(freshSay(say, 9000, 8000)).toBeNull();
    expect(freshSay(say, 500, 8000)).toBe("gg");
  });
});
