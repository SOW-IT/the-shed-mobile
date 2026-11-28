import { describe, expect, it } from "vitest";
import { botSeatUnder, isSlideDown, isSlideUp, mahjongTags, mahjongTap, slideSoFar, startsScrub, startsSlide, tableToWatch, takeoverSeats, tileUnder, type TableSummary } from "./tap";

const seat = (kind: "empty" | "human" | "bot", member: string | null = null, name = "") => ({ kind, member, name, away: false });
const table = (phase: TableSummary["phase"], seats: TableSummary["seats"]): TableSummary => ({ id: "t1", table: "mahjong-a", phase, seats });

describe("tapping a mahjong seat", () => {
  it("leaves other seats alone and sits at an empty table", () => {
    expect(mahjongTap("couch-0", [], "me")).toBeNull();
    expect(mahjongTap("mahjong-a-1", [], "me")).toEqual({ kind: "sit", seat: "mahjong-a-1" });
  });

  it("before a hand, sits in that seat or the next free one", () => {
    const lobby = table("lobby", [seat("human", "ann"), seat("bot"), seat("empty"), seat("human", "ben")]);
    expect(mahjongTap("mahjong-a-2", [lobby], "me")).toEqual({ kind: "sit", seat: "mahjong-a-2" });
    expect(mahjongTap("mahjong-a-1", [lobby], "me")).toEqual({ kind: "sit", seat: "mahjong-a-2" });
    const full = table("lobby", [seat("human", "ann"), seat("bot"), seat("bot"), seat("human", "ben")]);
    expect(mahjongTap("mahjong-a-1", [full], "me")).toEqual({ kind: "taken" });
    expect(mahjongTap("mahjong-a-1", [full], "ben")).toEqual({ kind: "sit", seat: "mahjong-a-3" });
  });

  it("lists the stools bots are playing during a hand, which a tap prefers over someone drawn over them", () => {
    const playing = table("playing", [seat("human", "ann"), seat("bot"), seat("bot"), seat("human", "ben")]);
    const lobby = { ...table("lobby", [seat("human", "cy"), seat("bot"), seat("empty"), seat("empty")]), id: "t2", table: "mahjong-b" };
    expect([...takeoverSeats([playing, lobby])]).toEqual(["mahjong-a-1", "mahjong-a-2"]);
    expect(takeoverSeats([]).size).toBe(0);
  });

  it("during a hand, sits in a bot's seat and watches anyone else's", () => {
    const playing = table("playing", [seat("human", "ann"), seat("bot", null, "Bamboo Bot"), seat("human", null), seat("human", "ben")]);
    expect(mahjongTap("mahjong-a-1", [playing], "me")).toEqual({ kind: "sit", seat: "mahjong-a-1" });
    expect(mahjongTap("mahjong-a-0", [playing], "me")).toEqual({ kind: "watch", tableId: "t1" });
    expect(mahjongTap("mahjong-a-2", [playing], "me")).toEqual({ kind: "watch", tableId: "t1" });
    expect(mahjongTap("mahjong-a-2", [playing], "ann")).toEqual({ kind: "sit", seat: "mahjong-a-0" });
    expect(mahjongTap("mahjong-a-2", [playing], null)).toEqual({ kind: "watch", tableId: "t1" });
    expect(tableToWatch([playing], "ben")).toBe("t1");
    expect(tableToWatch([playing], "zed")).toBeNull();
    expect(tableToWatch([playing], undefined)).toBeNull();
    expect(tableToWatch([table("lobby", playing.seats)], "ben")).toBeNull();
    expect(botSeatUnder([playing], "mahjong-a-1")).toEqual({ tableId: "t1", table: "mahjong-a", seat: 1, name: "Bamboo Bot" });
    expect(botSeatUnder([playing], "mahjong-a-0")).toBeNull();
    expect(botSeatUnder([playing], "mahjong-b-1")).toBeNull();
    expect(botSeatUnder([table("lobby", playing.seats)], "mahjong-a-1")).toBeNull();
  });
});

describe("the World's tags for mahjong players", () => {
  it("tags people playing a hand, not the lobby, bots or anyone away", () => {
    const playing = table("playing", [seat("human", "ann"), seat("bot"), { ...seat("human", "cal"), away: true }, seat("human", "ben")]);
    const tags = mahjongTags([playing, { ...table("lobby", [seat("human", "dee"), seat("empty"), seat("empty"), seat("empty")]), id: "t2", table: "mahjong-b" }]);
    expect([...tags.keys()]).toEqual(["ann", "ben"]);
    expect(tags.get("ann")).toEqual({ tag: "🀄 Mahjong", icon: "🀄", with: "ben" });
    expect(mahjongTags([table("playing", [seat("human", "ann"), seat("bot"), seat("bot"), seat("bot")])]).get("ann")?.with).toBe("");
  });
});

describe("sliding a tile up to discard", () => {
  it("needs a clear upward travel", () => {
    expect(isSlideUp(0, -40)).toBe(true);
    expect(isSlideUp(10, -60)).toBe(true);
    expect(isSlideUp(0, -30)).toBe(false);
    expect(isSlideUp(0, 60)).toBe(false);
  });

  it("never counts a sideways or sloppy move", () => {
    expect(isSlideUp(50, -45)).toBe(false);
    expect(isSlideUp(-80, -50)).toBe(false);
    expect(startsSlide(30, -12)).toBe(false);
    expect(startsSlide(2, -4)).toBe(false);
    expect(startsSlide(2, -14)).toBe(true);
  });

  it("takes a slide down as the tile's too, so it never also taps (and discards) it, and puts the tile back", () => {
    expect(startsSlide(2, 14)).toBe(true);
    expect(isSlideUp(0, 80)).toBe(false);
    expect(isSlideDown(0, 45)).toBe(true);
    expect(isSlideDown(0, 20)).toBe(true);
    expect(isSlideDown(0, 8)).toBe(false);
    expect(isSlideDown(0, -45)).toBe(false);
    expect(isSlideDown(60, 45)).toBe(false);
  });

  it("counts the whole slide, adding what it had gone when the tile took the touch to what it reports after", () => {
    // On iOS a 60 point flick: taken at 26, reported 34 since.
    expect(slideSoFar({ dx: 1, dy: 26 }, { dx: 0, dy: 34 })).toEqual({ dx: 1, dy: 60 });
    const up = slideSoFar({ dx: 0, dy: -14 }, { dx: 2, dy: -30 });
    expect(isSlideUp(up.dx, up.dy)).toBe(true);
    expect(isSlideUp(2, -30)).toBe(false);
  });

  it("leaves no drag past the thresholds to end as a tap: it's a slide or a scrub", () => {
    for (const [dx, dy] of [[30, -30], [-30, 30], [24, -18], [18, -24], [11, 11], [-9, -11], [40, 0], [0, -40]]) {
      expect(startsSlide(dx, dy) !== startsScrub(dx, dy)).toBe(true);
    }
    expect(startsSlide(30, -30)).toBe(true);
    expect(startsScrub(24, -18)).toBe(true);
  });
});

describe("scrubbing along your hand to pick a tile", () => {
  // Two rows of 40-wide tiles with a 1-point gap: 0, 1, 2 on top (y 0), 3, 4 and the drawn 5 below (y 60), 5 set apart.
  const rects = [
    { tile: 0, x: 0, y: 0, width: 40, height: 54 },
    { tile: 1, x: 41, y: 0, width: 40, height: 54 },
    { tile: 2, x: 82, y: 0, width: 40, height: 54 },
    { tile: 3, x: 0, y: 60, width: 40, height: 54 },
    { tile: 4, x: 41, y: 60, width: 40, height: 54 },
    { tile: 5, x: 88, y: 60, width: 40, height: 54 },
  ];

  it("starts on a sideways drag, never on an up or down one (those slide a tile)", () => {
    expect(startsScrub(12, 2)).toBe(true);
    expect(startsScrub(-20, 10)).toBe(true);
    expect(startsScrub(4, 0)).toBe(false);
    expect(startsScrub(10, 30)).toBe(false);
    expect(startsSlide(12, 2)).toBe(false);
  });

  it("picks the tile under the finger, one at a time, row by row", () => {
    expect(tileUnder(rects, 20, 27)).toBe(0);
    expect(tileUnder(rects, 60, 27)).toBe(1);
    expect(tileUnder(rects, 100, 27)).toBe(2);
    expect(tileUnder(rects, 60, 90)).toBe(4);
    expect(tileUnder(rects, 108, 90)).toBe(5);
  });

  it("gives a gap to the nearer tile, and still counts a finger a little off the tiles", () => {
    expect(tileUnder(rects, 86, 90)).toBe(5);
    expect(tileUnder(rects, 83, 90)).toBe(4);
    expect(tileUnder(rects, 60, -20)).toBe(1);
    expect(tileUnder(rects, 140, 90)).toBe(5);
  });

  it("finds nothing well off the hand", () => {
    expect(tileUnder(rects, 60, 300)).toBeNull();
    expect(tileUnder(rects, 400, 27)).toBeNull();
    expect(tileUnder([], 0, 0)).toBeNull();
  });
});
