import { describe, expect, it } from "vitest";
import { handRows, leaveQuestion, tileIndex, zoomShown, claimChoices, claimUses, firstClaim, lobbyWaiting, dealtCount, introElapsed, tumblingFace, coinsWords, faanLine, resultTitle, roundWords, seatAt, secondsLeft, sideOf, tileLabel, windBadge, windWords } from "./tableWords";

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

  it("lights the hand tiles a claim would take, a pong or kong first", () => {
    // 16 is the 5 of dots; the hand holds two more 5s (17, 18), and 8 and 12 (3 and 4 dots).
    const hand = [8, 12, 17, 18, 40];
    const choices = claimChoices({ hu: true, pong: true, kong: false, chows: [[8, 12]] }, 16);
    const of = (key: string) => choices.find((c) => c.key === key)!;
    expect(claimUses(of("pong"), hand, 16)).toEqual([17, 18]);
    expect(claimUses(of("chow-0"), hand, 16)).toEqual([8, 12]);
    expect(claimUses(of("hu"), hand, 16)).toEqual([]);
    expect(claimUses(of("pass"), hand, 16)).toEqual([]);
    expect(claimUses(claimChoices({ hu: false, pong: false, kong: true, chows: [] }, 16)[0], [17, 18, 19], 16)).toEqual([17, 18, 19]);
    expect(firstClaim(choices)?.key).toBe("pong");
    expect(firstClaim(claimChoices({ hu: false, pong: false, kong: false, chows: [[8, 12]] }, 16))?.key).toBe("chow-0");
    expect(firstClaim(claimChoices({ hu: true, pong: false, kong: false, chows: [] }, 16))).toBeNull();
  });

  it("names the people in the lobby the host would start without: not bots, not the host", () => {
    const seats = [{ kind: "human", ready: false }, { kind: "human", ready: true }, { kind: "bot", ready: false }, { kind: "human", ready: false }];
    expect(lobbyWaiting(seats, 0)).toEqual([3]);
    expect(lobbyWaiting(seats, 3)).toEqual([0]);
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

describe("the start of a hand", () => {
  it("counts time into the intro, never before it started or past its end", () => {
    expect(introElapsed(10_000, 10_000)).toBe(5200);
    expect(introElapsed(10_000, 9_000)).toBe(4200);
    expect(introElapsed(10_000, 0)).toBe(0);
    expect(introElapsed(10_000, 20_000)).toBe(5200);
  });

  it("only ever shows a die face from 1 to 6", () => {
    for (const elapsed of [-5000, 0, 119, 120, 5000])
      for (const value of [1, 6]) for (const i of [0, 2]) expect(tumblingFace(value, elapsed, i)).toBeGreaterThanOrEqual(1);
    expect(tumblingFace(6, 0, 0)).toBe(6);
    expect(tumblingFace(6, 120, 0)).toBe(1);
    expect(tumblingFace(1, -120, 0)).toBe(6);
  });

  it("deals in fours", () => {
    expect(dealtCount(0, 13, false)).toBe(0);
    expect(dealtCount(2700, 13, false)).toBe(4);
    expect(dealtCount(4499, 13, false)).toBe(13);
    expect(dealtCount(4500, 13, false)).toBe(13);
    expect(dealtCount(0, 13, true)).toBe(13);
  });
});

describe("tile labels for people who don't read the characters", () => {
  it("numbers the suits and letters the honours", () => {
    expect([0, 8, 9, 17, 18, 26].map(tileIndex)).toEqual(["1", "9", "1", "9", "1", "9"]);
    expect([27, 28, 29, 30].map(tileIndex)).toEqual(["E", "S", "W", "N"]);
    expect([31, 32, 33].map(tileIndex)).toEqual(["C", "F", "P"]);
  });
});

describe("a hand in two rows", () => {
  const tiles = [1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53];
  it("keeps one row when it's off", () => {
    expect(handRows(tiles, 53, false)).toEqual([tiles]);
  });

  it("splits the held tiles over two rows and ends the lower row with the drawn tile, every tile once", () => {
    const [top, bottom] = handRows(tiles, 53, true);
    expect(top).toHaveLength(7);
    expect(bottom.at(-1)).toBe(53);
    expect([...top, ...bottom].sort((a, b) => a - b)).toEqual(tiles);
  });

  it("splits a hand with no drawn tile, or one after melds, evenly", () => {
    expect(handRows(tiles.slice(0, 13), null, true).map((r) => r.length)).toEqual([7, 6]);
    expect(handRows([1, 5, 9, 13, 17], 17, true)).toEqual([[1, 5], [9, 13, 17]]);
  });
});

describe("asking before leaving a hand", () => {
  it("asks during a hand that a bot will take the seat, and doesn't ask after it or when watching", () => {
    expect(leaveQuestion("turn", true, false, 0)).toEqual({ title: "Leave the table?", lines: ["A bot plays your seat until you sit back down."], leave: "Leave" });
    expect(leaveQuestion("intro", true, false, 0)?.title).toBe("Leave the table?");
    expect(leaveQuestion("over", true, false, 0)).toBeNull();
    expect(leaveQuestion("turn", false, true, 3)).toBeNull();
  });

  it("adds what it costs when coins are on, or that it costs nothing", () => {
    expect(leaveQuestion("claim", true, true, 2)).toEqual({
      title: "Give up this hand?",
      lines: ["A bot plays your seat for the rest of this hand.", "You'll lose 2 SOW coins, shared between the other players."],
      leave: "Give up (−2)",
    });
    expect(leaveQuestion("turn", true, true, 0)?.lines[1]).toBe("You won't lose any SOW coins.");
  });
});

describe("the zoom on someone's discards", () => {
  it("stays open on your turn or a claim, and closes only when the hand is over", () => {
    expect(["intro", "turn", "claim"].map((stage) => zoomShown(2, stage))).toEqual([2, 2, 2]);
    expect(zoomShown(2, "over")).toBeNull();
    expect(zoomShown(null, "turn")).toBeNull();
  });
});

describe("the result's title", () => {
  it("says a robbed kong was robbed, not discarded", () => {
    const names = ["Anna", "Ben", "Cara", "Dan"];
    expect(resultTitle({ kind: "win", winner: 1, from: 0, robbed: true }, names, 2)).toBe("Ben wins, robbing Anna's kong");
    expect(resultTitle({ kind: "win", winner: 1, from: 0 }, names, 2)).toBe("Ben wins off Anna's discard");
    expect(resultTitle({ kind: "win", winner: 1, from: 0, robbed: true }, names, 0)).toBe("Ben wins, robbing your kong");
  });
});
