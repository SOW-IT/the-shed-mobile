import type { Placed } from "@shared/home";
import type { OptimisticLocalStore } from "convex/browser";
import { describe, expect, test } from "vitest";
import { isPending, showMove, showPlace, showRemove } from "./homeDecor";

type Home = { ownerName: string; mine: boolean; wallpaper: string; items: Placed[] };

/** A local store holding your home and someone else's. */
const storeWith = (mine: Home, theirs: Home) => {
  const rows = [
    { args: { roomId: "mine" }, value: mine as Home | undefined },
    { args: { roomId: "theirs" }, value: theirs as Home | undefined },
  ];
  const store = {
    getAllQueries: () => rows.map((row) => ({ ...row })),
    setQuery: (_query: unknown, args: { roomId: string }, value: Home) => {
      const row = rows.find((r) => r.args.roomId === args.roomId);
      if (row) row.value = value;
    },
  } as unknown as OptimisticLocalStore;
  return { store, home: (roomId: string) => rows.find((r) => r.args.roomId === roomId)?.value };
};

const chair: Placed = { key: "c1", item: "chair", x: 0, z: -4, turn: 0 };
const sofa: Placed = { key: "s1", item: "sofa", x: 1, z: -6, turn: 0 };
const fresh = () => storeWith({ ownerName: "Anna", mine: true, wallpaper: "plain", items: [chair, sofa] }, { ownerName: "Ben", mine: false, wallpaper: "plain", items: [{ ...chair }] });

describe("furniture shows where you put it before the server answers", () => {
  test("a moved piece is drawn at its new spot and turn at once, in your home only", () => {
    const { store, home } = fresh();
    showMove(store, { key: "c1", x: 2, z: -3, turn: 1 });
    expect(home("mine")?.items).toEqual([{ ...chair, x: 2, z: -3, turn: 1 }, sofa]);
    expect(home("theirs")?.items).toEqual([chair]);
  });

  test("a piece put down shows under a pending key until the server gives it one", () => {
    const { store, home } = fresh();
    showPlace("pending-1")(store, { item: "beanbag", x: -1, z: -2, turn: 0 });
    expect(home("mine")?.items.at(-1)).toEqual({ key: "pending-1", item: "beanbag", x: -1, z: -2, turn: 0 });
    expect(isPending("pending-1")).toBe(true);
    expect(isPending("c1")).toBe(false);
    expect(isPending(null)).toBe(false);
  });

  test("a piece put away goes at once", () => {
    const { store, home } = fresh();
    showRemove(store, { key: "s1" });
    expect(home("mine")?.items).toEqual([chair]);
  });
});
