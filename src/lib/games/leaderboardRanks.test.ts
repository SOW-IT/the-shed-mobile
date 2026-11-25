import { describe, expect, test } from "vitest";
import { leaderboardDate, leaderboardName, withRanks } from "./leaderboardRanks";

describe("leaderboard places", () => {
  test("number the rows, equal scores sharing the place of the first of them", () => {
    const scores = [900, 700, 700, 700, 500, 400, 400];
    expect(withRanks(scores.map((score) => ({ score }))).map((row) => row.rank)).toEqual([1, 2, 2, 2, 5, 6, 6]);
  });

  test("a tie that runs across two loaded pages still shares one place", () => {
    const first = [{ score: 30 }, { score: 20 }];
    const second = [{ score: 20 }, { score: 10 }];
    expect(withRanks([...first, ...second]).map((row) => row.rank)).toEqual([1, 2, 2, 4]);
  });

  test("keep each row's own fields", () => {
    expect(withRanks([{ score: 5, name: "Anna" }])).toEqual([{ score: 5, name: "Anna", rank: 1 }]);
    expect(withRanks([])).toEqual([]);
  });
});

describe("leaderboard rows", () => {
  test("always show the full name, whatever the World's name style", () => {
    expect(leaderboardName({ name: "Daniel Kim", isMe: false })).toBe("Daniel Kim");
    expect(leaderboardName({ name: "  Sam  de la Cruz ", isMe: false })).toBe("Sam de la Cruz");
    expect(leaderboardName({ name: "Daniel Kim", isMe: true })).toBe("Daniel Kim (you)");
    expect(leaderboardName({ name: "Sijin", isMe: false })).toBe("Sijin");
  });

  test("show the date of the best run, with the year only for earlier years, and none without one", () => {
    const now = new Date(2026, 10, 25, 9, 0).getTime();
    expect(leaderboardDate(new Date(2026, 10, 24, 20, 0).getTime(), now)).toBe("24 Nov");
    expect(leaderboardDate(new Date(2025, 10, 24, 20, 0).getTime(), now)).toBe("24 Nov 2025");
    expect(leaderboardDate(undefined, now)).toBeNull();
  });
});
