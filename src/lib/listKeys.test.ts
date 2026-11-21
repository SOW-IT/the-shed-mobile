import { describe, expect, test } from "vitest";
import { keyed, keysFor, rowIdsFor, rowKey, withRowAdded, withRowRemoved } from "./listKeys";

describe("keysFor", () => {
  test("each label is its own key", () => {
    expect(keysFor(["Gospel", "Significance"])).toEqual(["Gospel", "Significance"]);
  });

  test("a repeated label gets a count, so keys stay unique", () => {
    expect(keysFor(["a", "b", "a", "a"])).toEqual(["a", "b", "a\u00002", "a\u00003"]);
  });

  test("an item keeps its key when one before it goes", () => {
    const [, ...after] = keysFor(["x", "y", "z"]);
    expect(keysFor(["y", "z"])).toEqual(after);
  });
});

describe("keyed", () => {
  test("pairs each item with its key and index", () => {
    expect(keyed([{ n: "a" }, { n: "a" }], (x) => x.n)).toEqual([
      { item: { n: "a" }, key: "a", index: 0 },
      { item: { n: "a" }, key: "a\u00002", index: 1 },
    ]);
  });
});

describe("row ids", () => {
  test("start as one id per row", () => {
    expect(rowIdsFor(3)).toEqual({ ids: [0, 1, 2], next: 3 });
  });

  test("a removed row takes its id with it, and the rest keep theirs", () => {
    const rows = withRowRemoved(rowIdsFor(3), 1);
    expect([0, 1].map((i) => rowKey(rows, i))).toEqual(["0", "2"]);
  });

  test("an added row never reuses an id", () => {
    const rows = withRowAdded(withRowRemoved(rowIdsFor(2), 1));
    expect(rows.ids).toEqual([0, 2]);
  });

  test("a row past the ids, from a list replaced outside, gets a key of its own", () => {
    expect(rowKey(rowIdsFor(1), 2)).toBe("new-2");
  });
});
