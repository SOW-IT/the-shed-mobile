import { describe, expect, test } from "vitest";
import {
  OBSTACLES,
  PLACE_OBSTACLES,
  PLACES,
  PORTALS,
  pathAhead,
  posAt,
  SEATS,
  WALK_SPEED,
  walkLength,
  type Obstacle,
  type Walk,
} from "./world";
import { findPath as findMaybe, MAX_PATH_WAYPOINTS, sanitizePath } from "./worldPath";

const findPath = (...args: Parameters<typeof findMaybe>) => {
  const path = findMaybe(...args);
  if (!path) throw new Error("expected a route");
  return path;
};

const hitsAny = (walk: Walk, obstacles: readonly Obstacle[], start = 0) => {
  const total = walkLength(walk);
  const duration = (total / WALK_SPEED) * 1000;
  for (let ms = 0; ms <= duration; ms += 40) {
    const p = posAt(walk, start + ms);
    for (const o of obstacles) {
      if (Math.hypot((p.x - o.x) / o.rx, (p.z - o.z) / o.rz) < 0.95) return o.id;
    }
  }
  return null;
};

describe("findPath", () => {
  test("returns an empty path when the straight line is clear or points are very close", () => {
    expect(findPath("garden", { x: 0, z: 4 }, { x: 0.01, z: 4 })).toEqual([]);
    expect(findPath("garden", { x: 0, z: 4 }, { x: 1.5, z: 5 })).toEqual([]);
    expect(findPath("home", { x: -2, z: 2 }, { x: 2, z: -2 })).toEqual([]);
  });

  test("routes around the Garden birdbath instead of walking through it", () => {
    const from = { x: 0, z: 1.5 };
    const to = { x: 0, z: -6.0 };
    const path = findPath("garden", from, to);
    expect(path.length).toBeGreaterThan(0);
    const walk: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: 0, path };
    expect(hitsAny(walk, OBSTACLES)).toBeNull();
  });

  test("routes around the Campfire fire and logs", () => {
    const from = { x: 0, z: 2.5 };
    const to = { x: 0, z: -6.5 };
    const path = findPath("campfire", from, to);
    expect(path.length).toBeGreaterThan(0);
    const walk: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: 0, path };
    expect(hitsAny(walk, PLACE_OBSTACLES.campfire)).toBeNull();
  });

  test("routes around Chapel pews, piano and lectern, and allows sitting and standing", () => {
    const from = { x: -2.2, z: 3.5 };
    const to = { x: -2.2, z: -7.0 };
    const path = findPath("chapel", from, to);
    expect(path.length).toBeGreaterThan(0);
    const walk: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: 0, path };
    expect(hitsAny(walk, PLACE_OBSTACLES.chapel)).toBeNull();

    const pewSeat = SEATS.chapel[0];
    const toSeat = findPath("chapel", { x: 0, z: 5 }, pewSeat, [], { allowGoalInside: true });
    expect(toSeat.length).toBeGreaterThan(0);
    const fromSeat = findPath("chapel", pewSeat, { x: 0, z: 5 });
    expect(fromSeat.length).toBeGreaterThan(0);
  });

  test("routes around Cafe tables and custom Home furniture", () => {
    const tablePath = findPath("cafe", { x: -2.1, z: 2.0 }, { x: -2.1, z: -7.5 });
    expect(tablePath.length).toBeGreaterThan(0);
    const walk: Walk = {
      fromX: -2.1,
      fromZ: 2.0,
      toX: -2.1,
      toZ: -7.5,
      startedAt: 0,
      path: tablePath,
    };
    expect(hitsAny(walk, PLACE_OBSTACLES.cafe)).toBeNull();

    const sofa: Obstacle = { id: "sofa", x: 0, z: 0, rx: 1.5, rz: 0.7 };
    const homePath = findPath("home", { x: 0, z: 3 }, { x: 0, z: -3 }, [sofa]);
    expect(homePath.length).toBeGreaterThan(0);
    const homeWalk: Walk = { fromX: 0, fromZ: 3, toX: 0, toZ: -3, startedAt: 0, path: homePath };
    expect(hitsAny(homeWalk, [sofa])).toBeNull();
  });

  test("in every place, every pad can be walked to from every other pad, and every seat from the pads", () => {
    for (const place of PLACES) {
      for (const from of PORTALS[place]) {
        for (const to of PORTALS[place]) {
          if (from === to) continue;
          const path = findPath(place, from, to);
          const walk: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: 0, path };
          expect(hitsAny(walk, PLACE_OBSTACLES[place]), `${place}: ${from.to} pad to ${to.to} pad`).toBeNull();
        }
        for (const seat of SEATS[place]) {
          expect(findMaybe(place, from, seat, [], { allowGoalInside: true }), `${place}: ${from.to} pad to ${seat.id}`).not.toBeNull();
        }
      }
    }
  });

  test("routes around the Library's shelves, table and armchairs", () => {
    const from = { x: 0, z: 0 };
    const to = { x: 0, z: -8.5 };
    const path = findPath("library", from, to);
    expect(path.length).toBeGreaterThan(0);
    const walk: Walk = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: 0, path };
    expect(hitsAny(walk, PLACE_OBSTACLES.library)).toBeNull();
  });

  test("handles unreachable or fully blocked layouts safely", () => {
    const wall: Obstacle = { id: "wall", x: 0, z: 0, rx: 10, rz: 20 };
    expect(findMaybe("home", { x: 0, z: 2 }, { x: 0, z: -2 }, [wall])).toEqual([]);

    const fills: Obstacle = { id: "fills", x: 0, z: 0, rx: 30, rz: 30 };
    expect(findMaybe("home", { x: 40, z: 40 }, { x: 0, z: -2 }, [fills])).toBeNull();

    const divider: Obstacle = { id: "divider", x: 0, z: 0, rx: 6, rz: 0.8 };
    expect(findMaybe("home", { x: 0, z: 4 }, { x: 0, z: -4 }, [divider])).toBeNull();

    const tiny: Obstacle = { id: "tiny", x: 0, z: 0, rx: 0.2, rz: 0.2 };
    const shortPath = findMaybe("home", { x: 0, z: 0.21 }, { x: 0, z: -0.21 }, [tiny]);
    expect(Array.isArray(shortPath)).toBe(true);

    const sameCell = findPath("garden", { x: 0.82, z: -2.4 }, { x: 0.86, z: -2.35 });
    expect(sameCell).toEqual([]);
  });
});

describe("polyline posAt and sanitizePath", () => {
  test("walks each segment at WALK_SPEED with accurate heading and arrival", () => {
    const walk: Walk = {
      fromX: 0,
      fromZ: 0,
      toX: 3,
      toZ: 4,
      startedAt: 1000,
      path: [{ x: 3, z: 0 }],
    };
    expect(walkLength(walk)).toBeCloseTo(7);
    const leg1Ms = (3 / WALK_SPEED) * 1000;
    const totalMs = (7 / WALK_SPEED) * 1000;

    const mid1 = posAt(walk, 1000 + leg1Ms / 2);
    expect(mid1.x).toBeCloseTo(1.5);
    expect(mid1.z).toBeCloseTo(0);
    expect(mid1.walking).toBe(true);
    expect(mid1.heading).toBeCloseTo(Math.PI / 2);

    const mid2 = posAt(walk, 1000 + leg1Ms + ((2 / WALK_SPEED) * 1000));
    expect(mid2.x).toBeCloseTo(3);
    expect(mid2.z).toBeCloseTo(2);
    expect(mid2.walking).toBe(true);
    expect(mid2.heading).toBeCloseTo(0);

    const done = posAt(walk, 1000 + totalMs + 50);
    expect(done).toMatchObject({ x: 3, z: 4, walking: false, heading: 0 });
    expect(done.arrivesAt).toBeCloseTo(1000 + totalMs);

    const zeroWalk: Walk = {
      fromX: 1,
      fromZ: 1,
      toX: 1,
      toZ: 1,
      startedAt: 0,
      path: [{ x: 1, z: 1 }],
    };
    expect(posAt(zeroWalk, 50)).toEqual({ x: 1, z: 1, walking: false, heading: 0, arrivesAt: 0 });

    const duplicateEnd: Walk = {
      fromX: 0,
      fromZ: 0,
      toX: 2,
      toZ: 0,
      startedAt: 0,
      path: [{ x: 0, z: 0 }, { x: 2, z: 0 }],
    };
    expect(posAt(duplicateEnd, 5000)).toMatchObject({ x: 2, z: 0, walking: false });
    expect(posAt(duplicateEnd, 100).walking).toBe(true);
  });

  test("keeps only the waypoints still ahead", () => {
    const walk: Walk = {
      fromX: 0,
      fromZ: 0,
      toX: 3,
      toZ: 3,
      startedAt: 0,
      path: [
        { x: 3, z: 0 },
        { x: 3, z: 1 },
      ],
    };
    const at = (distance: number) => (distance / WALK_SPEED) * 1000;
    expect(pathAhead(walk, 0)).toEqual(walk.path);
    expect(pathAhead(walk, at(2))).toEqual(walk.path);
    expect(pathAhead(walk, at(3.5))).toEqual([{ x: 3, z: 1 }]);
    expect(pathAhead(walk, at(4.5))).toEqual([]);
    expect(pathAhead({ ...walk, path: undefined }, 0)).toEqual([]);
  });

  test("sanitizes waypoints on the server", () => {
    expect(sanitizePath(undefined, "garden")).toBeUndefined();
    expect(sanitizePath([], "garden")).toBeUndefined();
    expect(sanitizePath([{ x: Number.NaN, z: 0 }], "garden")).toBeUndefined();

    const long = Array.from({ length: MAX_PATH_WAYPOINTS + 5 }, (_, i) => ({ x: 1, z: i * 0.1 }));
    const cleaned = sanitizePath(long, "garden");
    expect(cleaned).toHaveLength(MAX_PATH_WAYPOINTS);

    const clamped = sanitizePath([{ x: 0, z: -2.4 }], "garden")!;
    expect(Math.hypot((clamped[0].x - 0) / 0.8, (clamped[0].z - -2.4) / 0.8)).toBeGreaterThanOrEqual(1);
  });
});
