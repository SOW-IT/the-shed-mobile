import { describe, expect, test } from "vitest";
import { withRanks } from "./leaderboardRanks";

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
