import { describe, expect, it } from "vitest";
import { cappedFaan, FAAN, scoreWin, type WinContext } from "./faan";
import { counts, kinds } from "./testTiles";

const ctx = (hand: string, extra: Partial<WinContext> = {}): WinContext => ({
  counts: counts(hand),
  melds: [],
  winKind: kinds(hand)[0],
  selfDrawn: false,
  seatWind: 1,
  roundWind: 0,
  ...extra,
});

const ids = (hand: string, extra: Partial<WinContext> = {}) => {
  const scored = scoreWin(ctx(hand, extra));
  return scored ? scored.lines.map((l) => l.id) : null;
};

describe("faan", () => {
  it("is null for a hand that isn't a win", () => {
    expect(scoreWin(ctx("123p 456s 789m RRR EW"))).toBeNull();
  });

  it("scores a chicken hand at nothing", () => {
    const scored = scoreWin(ctx("123p 456s 789m 111p EE", { melds: [{ type: "pong", kind: 0 }], counts: counts("123p 456s 789m EE"), winKind: 0 }));
    expect(scored).toEqual({ lines: [], total: 0, limit: false });
  });

  it("scores all chows, concealed and self-drawn", () => {
    expect(ids("123p 456s 789m 234p 55m", { selfDrawn: true })).toEqual(["allChows", "selfDrawn", "concealed"]);
  });

  it("scores all pongs and one suit", () => {
    expect(ids("111p 333p 555p 777p 99p", { melds: [], selfDrawn: false })).toContain("pureSuit");
    expect(ids("111p 333p 555p 777p EE")).toEqual(expect.arrayContaining(["allPongs", "mixedSuit"]));
    const mixed = scoreWin(ctx("111p 333p 555p 777p EE"))!;
    expect(mixed.total).toBe(FAAN.allPongs.faan + FAAN.mixedSuit.faan + FAAN.concealed.faan);
  });

  it("reads a hand the way that scores most", () => {
    // Three pongs of 1, 2, 3 read as pongs (all pongs) beat three chows.
    expect(ids("111222333p 999s RR")).toContain("allPongs");
  });

  it("treats a pong completed off a discard as open", () => {
    expect(ids("111p 333p 555p 777p 99s", { winKind: 0 })).toContain("allPongs");
    expect(ids("111p 333p 555p 777p 99s", { winKind: 0, selfDrawn: true })).toContain("concealedPongs");
    expect(ids("111p 333p 555p 777p 99s", { winKind: 17 })).toContain("concealedPongs");
    // The win tile could finish a chow instead, so the pong was concealed.
    expect(ids("111p 123s 555p 777p 99s", { winKind: 0 })).not.toContain("concealedPongs");
  });

  it("scores dragons and winds", () => {
    expect(ids("RRR 123p 456p 789s 55m")).toContain("dragonPong");
    expect(ids("RRR GGG 456p 789s WhWh")).toContain("smallDragons");
    expect(ids("RRR GGG WhWhWh 789s 55m")).toContain("greatDragons");
    expect(ids("SSS 123p 456p 789s 55m", { seatWind: 1 })).toContain("seatWind");
    expect(ids("EEE 123p 456p 789s 55m", { roundWind: 0 })).toContain("roundWind");
    expect(ids("EEE SSS WWW 789s NN")).toContain("smallWinds");
  });

  it("scores terminals", () => {
    expect(ids("111p 999p 111s 999s EE")).toEqual(expect.arrayContaining(["allPongs", "mixedTerminals"]));
  });

  it("scores situations", () => {
    expect(ids("123p 456s 789m 234p 55m", { selfDrawn: true, kongWin: true, lastTile: true })).toEqual(expect.arrayContaining(["kongWin", "lastTile"]));
    expect(ids("123p 456s 789m 234p 55m", { robbedKong: true })).toContain("robbedKong");
  });

  it("scores limit hands at the cap", () => {
    const orphans = scoreWin(ctx("19p 19s 19m ESWN RGWh E"))!;
    expect(orphans.limit).toBe(true);
    expect(cappedFaan(orphans, 10)).toBe(10);
    expect(ids("EEE SSS WWW NNN 55m")).toEqual(["greatWinds"]);
    expect(ids("EEE SSS RRR NNN GG")).toEqual(["allHonours"]);
    expect(ids("111p 999p 111s 999s 99m")).toEqual(["pureTerminals"]);
    expect(ids("11123456789999p")).toContain("nineGates");
    expect(ids("123p 456s 789m 234p 55m", { heavenly: true })).toEqual(["heavenly"]);
    expect(ids("123p 456s 789m 234p 55m", { earthly: true })).toEqual(["earthly"]);
    expect(
      ids("55m", {
        counts: counts("55m"),
        winKind: 22,
        melds: [
          { type: "kong", kind: 0 },
          { type: "kong", kind: 9 },
          { type: "kong", kind: 18, concealed: true },
          { type: "kong", kind: 27 },
        ],
      })
    ).toEqual(["fourKongs"]);
  });

  it("caps a big hand", () => {
    const big = scoreWin(ctx("111p 333p 555p 777p 99p", { selfDrawn: true }))!;
    expect(big.total).toBeGreaterThan(10);
    expect(cappedFaan(big, 10)).toBe(10);
    expect(cappedFaan(big, 13)).toBe(13);
  });

  it("only counts a concealed hand with no open melds", () => {
    expect(ids("456s 789m 234p 55m", { counts: counts("456s 789m 234p 55m"), melds: [{ type: "chow", kind: 0 }] })).not.toContain("concealed");
    expect(ids("456s 789m 234p 55m", { counts: counts("456s 789m 234p 55m"), melds: [{ type: "kong", kind: 0, concealed: true }] })).toContain("concealed");
  });
});
