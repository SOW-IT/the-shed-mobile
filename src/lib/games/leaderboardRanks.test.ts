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

  test("show the date and time of the best run, with the year only for earlier years, and none without one", () => {
    const now = new Date(2026, 10, 25, 9, 0).getTime();
    expect(leaderboardDate(new Date(2026, 10, 25, 8, 5).getTime(), now)).toBe("25 Nov, 8:05 am");
    expect(leaderboardDate(new Date(2026, 10, 24, 15, 42).getTime(), now)).toBe("24 Nov, 3:42 pm");
    expect(leaderboardDate(new Date(2025, 10, 24, 15, 42).getTime(), now)).toBe("24 Nov 2025, 3:42 pm");
    expect(leaderboardDate(new Date(2025, 0, 3, 9, 30).getTime(), now)).toBe("3 Jan 2025, 9:30 am");
    expect(leaderboardDate(undefined, now)).toBeNull();
  });

  test("show midnight as 12 am and noon as 12 pm", () => {
    const now = new Date(2026, 10, 25, 9, 0).getTime();
    expect(leaderboardDate(new Date(2026, 10, 25, 0, 0).getTime(), now)).toBe("25 Nov, 12:00 am");
    expect(leaderboardDate(new Date(2026, 10, 24, 12, 0).getTime(), now)).toBe("24 Nov, 12:00 pm");
    expect(leaderboardDate(new Date(2025, 11, 31, 23, 59).getTime(), now)).toBe("31 Dec 2025, 11:59 pm");
  });
});
