import { describe, expect, test } from "vitest";
import { personAt, tapTarget } from "./personHit";

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

describe("you are see-through to taps", () => {
  const board = { id: "notices", box: { left: 90, right: 200, top: 60, bottom: 160 }, depth: 9 };
  const me = { id: "me", me: true, box: { left: 120, right: 160, top: 90, bottom: 170 }, depth: 7 };

  test("standing in front of the notice board, a tap on you opens the board", () => {
    expect(tapTarget([me], [board], 140, 120)).toEqual({ kind: "prop", prop: board });
  });

  test("a tap on you with nothing behind you is a tap on the ground", () => {
    expect(tapTarget([me], [board], 140, 168)).toBeNull();
  });

  test("someone else in front of the board still takes the tap; the board in front of them takes it instead", () => {
    const ben = { ...me, id: "ben", me: false };
    expect(tapTarget([ben], [board], 140, 120)).toEqual({ kind: "person", person: ben });
    expect(tapTarget([{ ...ben, depth: 12 }], [board], 140, 120)).toEqual({ kind: "prop", prop: board });
  });

  test("a prop counts a few points outside its box, so a tap at its edge still lands", () => {
    expect(tapTarget([], [board], 204, 120)).toEqual({ kind: "prop", prop: board });
    expect(tapTarget([], [board], 210, 120)).toBeNull();
  });
});
