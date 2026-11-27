import { describe, expect, it } from "vitest";
import { isComplete, isThirteenOrphans, readings, shanten, waitsOf } from "./hand";
import { counts, kinds, seeded, tilesOf } from "./testTiles";
import { allTiles, countsOf, kindOf, shuffled, sortTiles, tileFace, tileName } from "./tiles";

describe("tiles", () => {
  it("has 136 tiles, four of each of the 34 kinds, and no flowers or seasons", () => {
    expect(allTiles()).toHaveLength(136);
    expect(countsOf(allTiles())).toHaveLength(34);
    expect(countsOf(allTiles()).every((n) => n === 4)).toBe(true);
  });

  it("names and draws every kind", () => {
    expect(tileName(4)).toBe("5 Dots");
    expect(tileName(9)).toBe("1 Bamboo");
    expect(tileName(26)).toBe("9 Characters");
    expect(tileName(27)).toBe("East Wind");
    expect(tileName(31)).toBe("Red Dragon");
    expect(tileFace(18)).toEqual({ top: "1", bottom: "萬" });
    expect(tileFace(28)).toEqual({ top: "南" });
    expect(tileFace(32)).toEqual({ top: "發" });
    expect(kindOf(135)).toBe(33);
  });

  it("shuffles every tile once and sorts by kind", () => {
    const out = shuffled(allTiles(), seeded(1));
    expect([...out].sort((a, b) => a - b)).toEqual(allTiles());
    expect(sortTiles([132, 5, 0, 4]).map(kindOf)).toEqual([0, 1, 1, 33]);
  });

  it("reads test hands", () => {
    expect(kinds("123m EWh")).toEqual([18, 19, 20, 27, 33]);
    expect(tilesOf("11p")).toEqual([0, 1]);
    expect(() => kinds("Q")).toThrow("Unknown tile");
  });
});

describe("winning hands", () => {
  it("finds every reading of a hand", () => {
    const all = readings(counts("111222333p 456s EE"), 4);
    expect(all.length).toBe(2);
    expect(all.some((r) => r.groups.every((g) => g.type === "pong" || g.kind >= 9))).toBe(true);
    expect(readings(counts("123p"), 4)).toEqual([]);
  });

  it("knows a complete hand with melds laid down", () => {
    expect(isComplete(counts("123p 456s 789m RRR EE"), 0)).toBe(true);
    expect(isComplete(counts("456s EE"), 3)).toBe(true);
    expect(isComplete(counts("123p 456s 789m RRR EW"), 0)).toBe(false);
  });

  it("knows Thirteen Orphans", () => {
    const orphans = counts("19p 19s 19m ESWN RGWh E");
    expect(isThirteenOrphans(orphans)).toBe(true);
    expect(isComplete(orphans, 0)).toBe(true);
    expect(isThirteenOrphans(counts("19p 19s 19m ESWN RGWh 2p"))).toBe(false);
    expect(isThirteenOrphans(counts("19p 19s 19m ESWN RG EE"))).toBe(false);
    expect(isThirteenOrphans(counts("19p 19s 19m ESWN RGWh Wh"))).toBe(true);
    expect(isThirteenOrphans(counts("19p 19s 19m ESWN RG EEE"))).toBe(false);
  });

  it("counts shanten", () => {
    expect(shanten(counts("123p 456s 789m RRR EE"), 0)).toBe(-1);
    expect(shanten(counts("123p 456s 789m RRR E"), 0)).toBe(0);
    expect(shanten(counts("123p 456s 789m RR EW"), 0)).toBe(1);
    expect(shanten(counts("147p 258s 369m ESW"), 0)).toBeGreaterThan(3);
    expect(shanten(counts("19p 19s 19m ESWN RG"), 0)).toBe(1);
    expect(shanten(counts("45s E"), 3)).toBe(1);
  });

  it("lists the waits", () => {
    expect(waitsOf(counts("123p 456s 789m RRR E"), 0)).toEqual(kinds("E"));
    expect(waitsOf(counts("123p 456s 789m RR 23s"), 0)).toEqual(kinds("147s"));
    expect(waitsOf(counts("1111p"), 3)).toEqual([]);
  });
});
