import { describe, expect, it } from "vitest";
import { allReady, botControlled, botName, emptySeats, everyoneAway, humanSeats, isMahjongTable, mahjongSeatId, mahjongSeatOf, nextHost, seatOfEmail, seatPlace, tableFull, type TableSeat } from "./table";

const human = (email: string, extra: Partial<Extract<TableSeat, { kind: "human" }>> = {}): TableSeat => ({ kind: "human", email, name: email, ...extra });
const bot: TableSeat = { kind: "bot", name: "Lucky Bot" };

describe("mahjong tables", () => {
  it("names its seats", () => {
    expect(mahjongSeatId("mahjong-b", 3)).toBe("mahjong-b-3");
    expect(mahjongSeatOf("mahjong-a-2")).toEqual({ table: "mahjong-a", seat: 2 });
    expect(mahjongSeatOf("mahjong-c-2")).toBeNull();
    expect(mahjongSeatOf("mahjong-a-4")).toBeNull();
    expect(mahjongSeatOf("table-a-left")).toBeNull();
    expect(mahjongSeatOf(undefined)).toBeNull();
    expect(isMahjongTable("mahjong-a")).toBe(true);
    expect(isMahjongTable(3)).toBe(false);
    expect(seatPlace(0)).toBe("East");
    expect(seatPlace(3)).toBe("North");
    expect(botName(0)).not.toBe(botName(1));
  });

  it("finds people and hands the host on in turn order", () => {
    const seats = [human("a"), bot, human("c"), { kind: "empty" as const }];
    expect(seatOfEmail(seats, "c")).toBe(2);
    expect(seatOfEmail(seats, "z")).toBe(-1);
    expect(humanSeats(seats)).toEqual([0, 2]);
    expect(nextHost(seats, 0)).toBe("c");
    expect(nextHost(seats, 2)).toBe("a");
    expect(nextHost(emptySeats(), 0)).toBeUndefined();
  });

  it("knows a full table, who a bot plays, and when everyone has gone", () => {
    expect(tableFull(emptySeats())).toBe(false);
    const seats = [human("a"), bot, human("c", { away: 5 }), bot];
    expect(tableFull(seats)).toBe(true);
    expect(botControlled(seats)).toEqual([false, true, true, true]);
    expect(everyoneAway(seats)).toBe(false);
    expect(everyoneAway([human("a", { away: 1 }), bot, bot, bot])).toBe(true);
    expect(everyoneAway([bot, bot, bot, bot])).toBe(false);
  });

  it("starts the next round when everyone here has asked", () => {
    expect(allReady([human("a", { ready: true }), bot, human("c"), bot])).toBe(false);
    expect(allReady([human("a", { ready: true }), bot, human("c", { ready: true }), bot])).toBe(true);
    expect(allReady([human("a", { ready: true, away: 3 }), bot, bot, bot])).toBe(false);
    expect(allReady([bot, bot, bot, bot])).toBe(false);
    expect(allReady([human("a", { ready: true }), bot, bot, { kind: "empty" }])).toBe(false);
  });
});
