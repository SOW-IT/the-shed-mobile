import { homeObstacles, seatsHere, type Placed } from "../../shared/home";
import { PLACE_OBSTACLES, type Place, type Seat } from "../../shared/world";
import type { Camera } from "./camera";

const SEAT_TAP_HEIGHT = 0.3;
const SEAT_TAP_RADIUS = 0.5;
const FOOTPRINT = 0.9;
const SLACK = 4;

const seatsOn = (seats: readonly Seat[], furniture: string) =>
  seats.filter((seat) => seat.id.startsWith(`${furniture}-`) && /^\d+$/.test(seat.id.slice(furniture.length + 1)));

/** The seat a tap on the stage lands on: one on the furniture under it, or a seat close by. At a home, its placed furniture's. */
export const seatAt = (place: Place, cam: Camera, x: number, y: number, items?: readonly Placed[]): string | null => {
  const seats = seatsHere(place, items);
  const under = [...PLACE_OBSTACLES[place], ...homeObstacles(items ?? [])]
    .map((o) => ({ o, seats: seatsOn(seats, o.id) }))
    .filter((f) => f.seats.length > 0)
    .map((f) => {
      const top = Math.max(...f.seats.map((seat) => seat.height));
      const corners = [-1, 1].flatMap((ex) =>
        [-1, 1].flatMap((ez) => [0, top].map((h) => cam.project([f.o.x + ex * f.o.rx * FOOTPRINT, h, f.o.z + ez * f.o.rz * FOOTPRINT])))
      );
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      const inside = x >= Math.min(...xs) - SLACK && x <= Math.max(...xs) + SLACK && y >= Math.min(...ys) - SLACK && y <= Math.max(...ys) + SLACK;
      return { ...f, inside, depth: cam.project([f.o.x, 0, f.o.z]).depth };
    })
    .filter((f) => f.inside)
    .sort((a, b) => a.depth - b.depth)[0];
  const best = (under?.seats ?? seats)
    .map((seat) => {
      const at = cam.project([seat.x, seat.height + SEAT_TAP_HEIGHT, seat.z]);
      return { id: seat.id, miss: Math.hypot(at.x - x, at.y - y) / at.scale };
    })
    .sort((a, b) => a.miss - b.miss)[0];
  return best && (under || best.miss < SEAT_TAP_RADIUS) ? best.id : null;
};
