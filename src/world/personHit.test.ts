import { describe, expect, test } from "vitest";
import { personAt } from "./personHit";

const box = (left: number, top: number) => ({ left, right: left + 40, top, bottom: top + 80 });

describe("what a tap on a person hits", () => {
  const me = { id: "me", me: true, box: box(100, 100), depth: 5 };
  const ben = { id: "ben", me: false, box: box(120, 100), depth: 6 };
  const cara = { id: "cara", me: false, box: box(300, 100), depth: 4 };

  test("a tap on yourself isn't a tap on a person, so it walks there like any ground tap", () => {
    expect(personAt([me, cara], 110, 150)).toBeNull();
  });

  test("a tap on someone else still opens them, even where they stand behind you", () => {
    expect(personAt([me, ben, cara], 130, 150)?.id).toBe("ben");
    expect(personAt([me, ben, cara], 310, 120)?.id).toBe("cara");
  });

  test("of two people under the finger, the one nearer the camera wins", () => {
    const front = { id: "front", me: false, box: box(300, 100), depth: 2 };
    expect(personAt([cara, front], 310, 120)?.id).toBe("front");
  });
});
