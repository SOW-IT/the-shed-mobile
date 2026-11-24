import { describe, expect, test } from "vitest";
import { layerOrder } from "./tags";

const body = (key: string, depth: number) => ({ key, depth });
const tag = (key: string, depth: number) => ({ key: `${key}:tag`, depth, tag: true });

describe("name tags and bubbles layered with their owners", () => {
  test("far to near, each tag drawn right after its own body", () => {
    const order = layerOrder([tag("near", 10), body("far", 20), body("near", 10), tag("far", 20)]).map((item) => item.key);
    expect(order).toEqual(["far", "far:tag", "near", "near:tag"]);
  });

  test("someone in front covers the tag of someone behind, and their own tag stays on top of them", () => {
    const order = layerOrder([body("front", 8), tag("back", 12), body("back", 12), tag("front", 8)]).map((item) => item.key);
    expect(order.indexOf("back:tag")).toBeLessThan(order.indexOf("front"));
    expect(order.indexOf("front:tag")).toBeGreaterThan(order.indexOf("front"));
  });

  test("tags keep where they were put: nothing is moved or dropped", () => {
    const items = [{ ...tag("a", 5), x: 100, y: 40 }, { ...tag("b", 5.01), x: 101, y: 40 }];
    const order = layerOrder(items);
    expect(order).toHaveLength(2);
    expect(order.map(({ x, y }) => [x, y])).toEqual([[101, 40], [100, 40]]);
  });
});
