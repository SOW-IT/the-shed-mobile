import { describe, expect, test } from "vitest";
import { podiumSteps } from "./podium";

const rows = (...scores: number[]) => scores.map((score, i) => ({ id: `p${i + 1}`, score }));
const ids = (steps: ReturnType<typeof podiumSteps<{ id: string; score: number }>>) => steps?.map((s) => s.entry?.id ?? null);

describe("podiumSteps", () => {
  test("puts 1st in the middle and highest, 2nd on the left, 3rd on the right", () => {
    const steps = podiumSteps(rows(900, 500, 300));
    expect(ids(steps)).toEqual(["p2", "p1", "p3"]);
    expect(steps?.map((s) => s.height)).toEqual([0.72, 1, 0.5]);
    expect(steps?.map((s) => s.entry?.rank)).toEqual([2, 1, 3]);
  });

  test("only the top three stand on it", () => {
    expect(ids(podiumSteps(rows(9, 8, 7, 6, 5)))).toEqual(["p2", "p1", "p3"]);
  });

  test("with one or two people, the other steps stand empty at their usual height", () => {
    const one = podiumSteps(rows(40));
    expect(ids(one)).toEqual([null, "p1", null]);
    expect(one?.map((s) => s.height)).toEqual([0.72, 1, 0.5]);
    expect(ids(podiumSteps(rows(40, 30)))).toEqual(["p2", "p1", null]);
  });

  test("is null when nobody has a score", () => {
    expect(podiumSteps([])).toBeNull();
  });

  test("a tie shares the place and stands level", () => {
    const tiedFirst = podiumSteps(rows(700, 700, 200));
    expect(tiedFirst?.map((s) => s.entry?.rank)).toEqual([1, 1, 3]);
    expect(tiedFirst?.map((s) => s.height)).toEqual([1, 1, 0.5]);
    const tiedSecond = podiumSteps(rows(700, 300, 300));
    expect(tiedSecond?.map((s) => s.height)).toEqual([0.72, 1, 0.72]);
  });
});
