import { describe, expect, test } from "vitest";
import { beatenInTop, beatenPush } from "./leaderboard";

const board = (...rows: [string, number][]) => rows.map(([email, score]) => ({ email, score }));

describe("beatenInTop", () => {
  const top = board(["a", 900], ["b", 700], ["c", 500], ["e", 400], ["f", 100]);

  test("everyone in the top 3 the new score passes drops one place", () => {
    expect(beatenInTop(top, "d", null, 800)).toEqual([
      { email: "b", place: 3 },
      { email: "c", place: 4 },
    ]);
    expect(beatenInTop(top, "d", null, 1000)).toEqual([
      { email: "a", place: 2 },
      { email: "b", place: 3 },
      { email: "c", place: 4 },
    ]);
  });

  test("a tie passes nobody", () => {
    expect(beatenInTop(top, "d", null, 700)).toEqual([{ email: "c", place: 4 }]);
    expect(beatenInTop(board(["a", 900], ["b", 700]), "d", null, 700)).toEqual([]);
  });

  test("below the top 3 nobody is told", () => {
    expect(beatenInTop(top, "d", null, 450)).toEqual([]);
  });

  test("the player is never told, and people they were already ahead of don't move", () => {
    expect(beatenInTop(top, "b", 700, 950)).toEqual([{ email: "a", place: 2 }]);
    expect(beatenInTop(top, "c", 500, 600)).toEqual([]);
    expect(beatenInTop(board(["a", 900], ["d", 300], ["c", 500]), "d", 300, 400)).toEqual([]);
  });

  test("someone tied with the player's old best drops when the player moves ahead", () => {
    expect(beatenInTop(board(["a", 900], ["d", 500], ["c", 500]), "d", 500, 600)).toEqual([{ email: "c", place: 3 }]);
  });

  test("people tied at a place all drop together", () => {
    expect(beatenInTop(board(["a", 900], ["b", 500], ["c", 500], ["e", 500]), "d", null, 600)).toEqual([
      { email: "b", place: 3 },
      { email: "c", place: 3 },
      { email: "e", place: 3 },
    ]);
  });
});

describe("beatenPush", () => {
  test("says who, which game and the new place, and opens that game's leaderboard", () => {
    expect(beatenPush("Daniel Kim", "flappy", 3)).toEqual({
      title: "Daniel Kim just beat you in Flap",
      body: "You're now 3rd",
      url: "/games/leaderboard?game=flappy",
    });
    expect(beatenPush("Daniel Kim", "glider", 2).body).toBe("You're now 2nd");
  });

  test("says when they're out of the top 3", () => {
    expect(beatenPush("Ana Lee", "shooter", 4)).toEqual({
      title: "Ana Lee just beat you in Sky Shooter",
      body: "You're out of the top 3",
      url: "/games/leaderboard?game=shooter",
    });
  });
});
