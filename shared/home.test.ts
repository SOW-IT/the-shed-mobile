import { describe, expect, test } from "vitest";
import { BACK_DOOR, blocksBackDoor, DOOR_CLEAR, FURNITURE, FURNITURE_IDS, HOME_DOOR, fitInRoom, footprint, homeObstacles, homeSeatPiece, homeSeats, isSittable, ownedLeft, placementProblem, seatHere, seatsHere, wallpaperOr, type Placed } from "./home";
import { halfWidthAt, SEAT_TURN, SEATS, WALK_BOUNDS } from "./world";

describe("placing furniture", () => {
  test("a turn swaps how wide and deep it is", () => {
    expect(footprint("bed", 0)).toEqual({ hw: FURNITURE.bed.w / 2, hd: FURNITURE.bed.d / 2 });
    expect(footprint("bed", 1)).toEqual({ hw: FURNITURE.bed.d / 2, hd: FURNITURE.bed.w / 2 });
    expect(footprint("bed", 2)).toEqual(footprint("bed", 0));
  });

  test("the middle of the room is fine at every turn", () => {
    for (const item of FURNITURE_IDS) for (const turn of [0, 1, 2, 3]) expect(placementProblem(item, 0, -4, turn)).toBeNull();
  });

  test("nothing pokes through a wall", () => {
    expect(placementProblem("sofa", WALK_BOUNDS.maxX, -4, 0)).toMatch(/inside the room/);
    expect(placementProblem("sofa", 0, WALK_BOUNDS.minZ, 0)).toMatch(/inside the room/);
    const { hw } = footprint("sofa", 0);
    expect(placementProblem("sofa", halfWidthAt(-4) - hw, -4, 0)).toBeNull();
    expect(placementProblem("sofa", halfWidthAt(-4) - hw + 0.01, -4, 0)).toMatch(/inside the room/);
  });

  test("the doorway stays clear", () => {
    expect(placementProblem("plant", HOME_DOOR.x, HOME_DOOR.z - DOOR_CLEAR, 0)).toMatch(/doorway/);
    expect(placementProblem("plant", HOME_DOOR.x, HOME_DOOR.z - DOOR_CLEAR - footprint("plant", 0).hd - 0.01, 0)).toBeNull();
  });

  test("turns things away that aren't furniture or a quarter turn", () => {
    expect(placementProblem("spaceship", 0, 0, 0)).toMatch(/isn't something/);
    expect(placementProblem("rug", 0, 0, 4)).toMatch(/way it can face/);
    expect(placementProblem("rug", Number.NaN, 0, 0)).toMatch(/floor/);
  });

  test("fitting pulls a spot back inside and out of the doorway", () => {
    for (const [x, z] of [[40, 40], [-40, -40], [0, 7], [3.9, 7.6]] as const) {
      for (const turn of [0, 1] as const) {
        const spot = fitInRoom("bed", x, z, turn);
        expect(spot).not.toBeNull();
        expect(placementProblem("bed", spot!.x, spot!.z, turn)).toBeNull();
      }
    }
  });

  test("fitting keeps the back door clear too", () => {
    for (const turn of [0, 1] as const) {
      const spot = fitInRoom("sofa", BACK_DOOR.x, BACK_DOOR.z, turn);
      expect(spot).not.toBeNull();
      expect(blocksBackDoor("sofa", spot!.x, spot!.z, turn)).toBe(false);
    }
  });

  test("something already in the back doorway doesn't block the way out", () => {
    const placed = [
      { key: "door", item: "sofa", x: BACK_DOOR.x, z: BACK_DOOR.z, turn: 0 },
      { key: "side", item: "sofa", x: 2.6, z: BACK_DOOR.z, turn: 1 },
    ];
    expect(homeObstacles(placed).map((o) => o.id)).toEqual(["side"]);
  });

  test("solid things block walking, rugs don't", () => {
    const placed = [
      { key: "a", item: "rug", x: 0, z: 0, turn: 0 },
      { key: "b", item: "table", x: 1, z: -3, turn: 1 },
      { key: "c", item: "gone", x: 0, z: 0, turn: 0 },
    ];
    expect(homeObstacles(placed).map((o) => o.id)).toEqual(["b"]);
    expect(ownedLeft({ table: 2 }, placed, "table")).toBe(1);
    expect(ownedLeft(undefined, placed, "rug")).toBe(-1);
  });

  test("an unknown wallpaper shows as plain", () => {
    expect(wallpaperOr("mint")).toBe("mint");
    expect(wallpaperOr("tartan")).toBe("plain");
    expect(wallpaperOr(undefined)).toBe("plain");
  });
});

describe("sitting on your furniture", () => {
  const piece = (item: string, turn = 0, x = 0, z = -4): Placed => ({ key: `k${item}${turn}`, item, x, z, turn });

  test("chairs, beanbags, sofas and the bed seat people; the rest don't", () => {
    expect(FURNITURE_IDS.filter(isSittable)).toEqual(["chair", "beanbag", "sofa", "bed"]);
    for (const item of ["rug", "plant", "lamp", "table", "bookshelf", "desk", "tv", "fireplace"]) expect(homeSeats([piece(item)])).toEqual([]);
    expect(homeSeats([piece("chair")]).map((s) => s.id)).toEqual(["kchair0-0"]);
    expect(homeSeats([piece("beanbag")])).toHaveLength(1);
    expect(homeSeats([piece("sofa")]).map((s) => s.id)).toEqual(["ksofa0-0", "ksofa0-1"]);
    expect(homeSeats([piece("bed")])).toHaveLength(2);
  });

  test("each seat is on its piece, people sharing one have room, and every seat is somewhere you can be", () => {
    for (const item of FURNITURE_IDS.filter(isSittable)) {
      for (const turn of [0, 1, 2, 3]) {
        const p = piece(item, turn, 1.2, -5);
        const [box] = homeObstacles([p]);
        const seats = homeSeats([p]);
        for (const seat of seats) {
          expect(Math.abs(seat.x - p.x), `${item} ${turn}`).toBeLessThan(box.rx);
          expect(Math.abs(seat.z - p.z), `${item} ${turn}`).toBeLessThan(box.rz);
          expect(seat.height).toBeGreaterThan(0);
          expect(homeSeatPiece(seat.id)).toBe(p.key);
        }
        for (const a of seats) for (const b of seats) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.7);
      }
    }
  });

  test("you sit facing the way the piece faces, turned toward the camera like every seat outside the Chapel", () => {
    expect(homeSeats([piece("chair", 0)])[0].heading).toBe(0);
    expect(homeSeats([piece("chair", 1)])[0].heading).toBeCloseTo(Math.PI / 2 - SEAT_TURN);
    expect(homeSeats([piece("chair", 3)])[0].heading).toBeCloseTo(-Math.PI / 2 + SEAT_TURN);
    expect(Math.abs(homeSeats([piece("chair", 2)])[0].heading)).toBeCloseTo(Math.PI - SEAT_TURN);
    // A sofa turned to face right: its two seats run front to back, both facing right.
    const [a, b] = homeSeats([piece("sofa", 1)]);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.2);
    expect(Math.abs(a.z - b.z)).toBeGreaterThan(0.7);
    expect(Math.sin(a.heading)).toBeGreaterThan(0);
  });

  test("seats come from what's placed, only at home", () => {
    const items = [piece("chair"), piece("table", 0, 2, -4)];
    expect(seatsHere("home", items).map((s) => s.id)).toEqual(["kchair0-0"]);
    expect(seatsHere("home", undefined)).toEqual([]);
    expect(seatsHere("cafe", items)).toBe(SEATS.cafe);
    expect(seatHere("home", "kchair0-0", items)).toMatchObject({ x: 0, height: expect.any(Number) });
    expect(seatHere("home", "kchair0-0", [])).toBeNull();
    expect(seatHere("home", undefined, items)).toBeNull();
    expect(seatHere("home", "ktable00-0", items)).toBeNull();
  });
});
