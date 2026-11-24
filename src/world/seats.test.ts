import { describe, expect, test } from "vitest";
import { PLACE_OBSTACLES, SEATS, type Place } from "../../shared/world";
import { makeCamera } from "./camera";
import { seatAt } from "./seats";

const cam = makeCamera(402, 700, { x: 0, z: -2.6 });
const on = (place: Place, id: string, dx: number, y: number) => {
  const o = PLACE_OBSTACLES[place].find((obstacle) => obstacle.id === id)!;
  const at = cam.project([o.x + dx * o.rx, y, o.z]);
  return seatAt(place, cam, at.x, at.y);
};

describe("tapping somewhere to sit", () => {
  test("anywhere on the Campfire's back log sits on it, like the side logs", () => {
    for (const y of [0.05, 0.15, 0.3]) {
      expect(on("campfire", "log-back", 0, y)).toMatch(/^log-back-/);
      expect(on("campfire", "log-left", 0, y)).toMatch(/^log-left-/);
      expect(on("campfire", "log-right", 0, y)).toMatch(/^log-right-/);
    }
    expect(on("campfire", "log-back", -0.8, 0.15)).toBe("log-back-0");
    expect(on("campfire", "log-back", 0.8, 0.15)).toBe("log-back-1");
  });

  test("the back log's seats are on the log, facing the fire", () => {
    const log = PLACE_OBSTACLES.campfire.find((o) => o.id === "log-back")!;
    const seats = SEATS.campfire.filter((seat) => seat.id.startsWith("log-back"));
    expect(seats).toHaveLength(2);
    for (const seat of seats) {
      expect(Math.hypot((seat.x - log.x) / log.rx, (seat.z - log.z) / log.rz)).toBeLessThan(1);
      expect(seat.heading).toBe(0);
      expect(seat.height).toBeGreaterThan(0);
    }
  });

  test("open ground isn't a seat, and seats without furniture still take a tap close by", () => {
    const ground = cam.project([1.5, 0, 3]);
    expect(seatAt("campfire", cam, ground.x, ground.y)).toBeNull();
    const towel = SEATS.beach[0];
    const at = cam.project([towel.x, towel.height + 0.3, towel.z]);
    expect(seatAt("beach", cam, at.x, at.y)).toBe(towel.id);
  });

  test("a café table isn't one of its stools", () => {
    expect(on("cafe", "table-a", 0, 0.6)).toBeNull();
    expect(on("cafe", "couch", 0, 0.2)).toMatch(/^couch-/);
  });
});
