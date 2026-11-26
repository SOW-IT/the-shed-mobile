import { describe, expect, it } from "vitest";
import { botSeatUnder, mahjongTap, tableToWatch, type TableSummary } from "./tap";

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
