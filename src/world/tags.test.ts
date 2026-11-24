import { describe, expect, test } from "vitest";
import { MAX_NUDGE, spreadTags } from "./tags";

const tag = (x: number, width = 60, bottom = 100) => ({ x, bottom, width, height: 24 });

describe("name tags side by side", () => {
  test("tags far apart stay put", () => {
    expect(spreadTags([tag(0), tag(200)])).toEqual([tag(0), tag(200)]);
  });

  test("touching tags are nudged apart, each a little", () => {
    const [a, b] = spreadTags([tag(100), tag(140)]);
    expect(b.x - a.x).toBeGreaterThanOrEqual(64);
    expect(Math.abs(a.x - 100)).toBeLessThanOrEqual(60 * MAX_NUDGE);
    expect(Math.abs(b.x - 140)).toBeLessThanOrEqual(60 * MAX_NUDGE);
    expect(a.bottom).toBe(100);
    expect(b.bottom).toBe(100);
  });

  test("tags on top of each other stack instead of sliding off their owners", () => {
    const [a, b] = spreadTags([tag(100), tag(101)]);
    expect(Math.abs(b.x - 101)).toBeLessThanOrEqual(60 * MAX_NUDGE);
    expect(b.bottom).toBeLessThanOrEqual(a.bottom - a.height);
  });

  test("tags at different heights don't move", () => {
    expect(spreadTags([tag(100, 60, 100), tag(110, 60, 300)])).toEqual([tag(100, 60, 100), tag(110, 60, 300)]);
  });
});

describe("a crowd's name tags", () => {
  test("stack one level at most", () => {
    const row = Array.from({ length: 8 }, (_, i) => tag(100 + i * 30));
    const spread = spreadTags(row);
    for (const t of spread) expect(t.bottom).toBeGreaterThanOrEqual(100 - 24 - 4);
  });
});

describe("tags kept apart", () => {
  const apart = (tags: { x: number; bottom: number; width: number; height: number }[]) => {
    for (let i = 0; i < tags.length; i++) {
      for (let j = 0; j < i; j++) {
        const [a, b] = [tags[i], tags[j]];
        const across = (a.width + b.width) / 2 - Math.abs(a.x - b.x);
        const up = Math.min(a.bottom, b.bottom) - Math.max(a.bottom - a.height, b.bottom - b.height);
        expect(across > 0 && up > 0, `tags ${j} and ${i}`).toBe(false);
      }
    }
  };

  test("nudging one pair doesn't push into a pair already apart", () => {
    const spread = spreadTags([tag(100), tag(164), tag(200)]);
    apart(spread);
    expect(spread[0]).toEqual(tag(100));
  });

  test("tags near the top stay on screen and still apart", () => {
    const spread = spreadTags([tag(100, 60, 10), tag(101, 60, 10)], 4);
    apart(spread);
    for (const t of spread) expect(t.bottom - t.height).toBeGreaterThanOrEqual(4);
  });
});
