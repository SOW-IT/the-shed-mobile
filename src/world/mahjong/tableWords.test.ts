import { describe, expect, it } from "vitest";
import { claimChoices, coinsWords, faanLine, resultTitle, roundWords, seatAt, secondsLeft, sideOf, tileLabel, windBadge, windWords } from "./tableWords";

describe("the table's words", () => {
  it("puts you at the bottom and the next seat on your right", () => {
    expect([0, 1, 2, 3].map((s) => sideOf(s, 0))).toEqual(["bottom", "right", "top", "left"]);
    expect([0, 1, 2, 3].map((s) => sideOf(s, 2))).toEqual(["top", "left", "bottom", "right"]);
    expect(seatAt("left", 1)).toBe(0);
    expect(seatAt("right", 3)).toBe(0);
  });

  it("names rounds, winds, coins and time", () => {
    expect(roundWords(0)).toBe("East Round");
    expect(windBadge(2)).toBe("西");
    expect(windWords(1)).toBe("South wind");
    expect(coinsWords(12)).toBe("+12");
    expect(coinsWords(-4)).toBe("−4");
    expect(coinsWords(0)).toBe("0");
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
    expect(tileLabel(-1)).toBe("Face down");
    expect(tileLabel(0)).toBe("1 Dots");
  });

  it("lists claims: Hu first, a Chow for each way, Pass last", () => {
    const choices = claimChoices({ hu: true, pong: true, kong: false, chows: [[8, 12], [12, 20]] }, 16);
    expect(choices.map((c) => c.key)).toEqual(["hu", "pong", "chow-0", "chow-1", "pass"]);
    expect(choices[2]).toMatchObject({ answer: { kind: "chow", option: 0 }, tiles: [8, 12, 16] });
    expect(claimChoices({ hu: false, pong: false, kong: true, chows: [] }, 0).map((c) => c.key)).toEqual(["kong", "pass"]);
  });

  it("titles the breakdown", () => {
    const names = ["You", "Ben", "Lucky Bot", "Lotus Bot"];
    expect(resultTitle({ kind: "draw" }, names, 0)).toBe("Drawn hand");
    expect(resultTitle({ kind: "win", winner: 0, from: null }, names, 0)).toBe("You win, self-drawn");
    expect(resultTitle({ kind: "win", winner: 1, from: 0 }, names, 0)).toBe("Ben wins off your discard");
    expect(resultTitle({ kind: "win", winner: 2, from: 1 }, names, null)).toBe("Lucky Bot wins off Ben's discard");
    expect(faanLine("pureSuit")).toMatchObject({ zh: "清一色", faan: 7 });
    expect(faanLine("nope")).toEqual({ zh: "", en: "nope", faan: 0 });
  });
});
