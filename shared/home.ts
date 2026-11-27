import { along, ARMCHAIR_HEIGHT, CHAIR_HEIGHT, COUCH_HEIGHT, halfWidthAt, HOME, SEATS, towardCamera, WALK_BOUNDS, type Place, type Seat } from "./world";

export const FURNITURE = {
  rug: { label: "Rug", price: 10, w: 2.4, d: 1.6, solid: false },
  plant: { label: "Plant", price: 15, w: 0.6, d: 0.6, solid: true },
  lamp: { label: "Lamp", price: 20, w: 0.5, d: 0.5, solid: true },
  chair: { label: "Chair", price: 25, w: 0.6, d: 0.6, solid: true },
  beanbag: { label: "Beanbag", price: 30, w: 0.9, d: 0.9, solid: true },
  table: { label: "Table", price: 40, w: 1.3, d: 0.8, solid: true },
  bookshelf: { label: "Bookshelf", price: 60, w: 1.4, d: 0.45, solid: true },
  desk: { label: "Desk", price: 70, w: 1.4, d: 0.7, solid: true },
  tv: { label: "TV", price: 90, w: 1.4, d: 0.5, solid: true },
  sofa: { label: "Sofa", price: 110, w: 2.1, d: 0.9, solid: true },
  fireplace: { label: "Fireplace", price: 130, w: 1.6, d: 0.6, solid: true },
  bed: { label: "Bed", price: 150, w: 1.5, d: 2.2, solid: true },
} as const;
export type FurnitureId = keyof typeof FURNITURE;
export const FURNITURE_IDS = Object.keys(FURNITURE) as FurnitureId[];
export const isFurniture = (value: string): value is FurnitureId => Object.hasOwn(FURNITURE, value);

export const WALLPAPERS = {
  plain: { label: "Plain", price: 0 },
  mint: { label: "Mint stripes", price: 20 },
  rose: { label: "Rose dots", price: 20 },
  sky: { label: "Sky", price: 20 },
  sunset: { label: "Sunset", price: 20 },
  lavender: { label: "Lavender check", price: 20 },
  forest: { label: "Forest", price: 20 },
  stars: { label: "Night stars", price: 20 },
  lemon: { label: "Lemon", price: 20 },
} as const;
export type WallpaperId = keyof typeof WALLPAPERS;
export const WALLPAPER_IDS = Object.keys(WALLPAPERS) as WallpaperId[];
export const DEFAULT_WALLPAPER: WallpaperId = "plain";
export const isWallpaper = (value: string): value is WallpaperId => Object.hasOwn(WALLPAPERS, value);
export const wallpaperOr = (value: string | undefined): WallpaperId => (value !== undefined && isWallpaper(value) ? value : DEFAULT_WALLPAPER);

export const HOME_CAP = 8;
export const HOME_MAX_ITEMS = 30;
export const MAX_OWNED_EACH = 10;
export const HOME_DOOR = { x: 0, z: 7 } as const;
export const DOOR_CLEAR = 2;
export const BACK_DOOR = { x: 0, z: -10 } as const;

type Turn = 0 | 1 | 2 | 3;
export const isTurn = (value: number): value is Turn => value === 0 || value === 1 || value === 2 || value === 3;

export type Placed = { key: string; item: string; x: number; z: number; turn: number };

export const footprint = (item: FurnitureId, turn: number) => {
  const { w, d } = FURNITURE[item];
  return turn % 2 === 0 ? { hw: w / 2, hd: d / 2 } : { hw: d / 2, hd: w / 2 };
};

export const placementProblem = (item: string, x: number, z: number, turn: number): string | null => {
  if (!isFurniture(item)) return "That isn't something you can place.";
  if (!isTurn(turn)) return "That isn't a way it can face.";
  if (!Number.isFinite(x) || !Number.isFinite(z)) return "That isn't on the floor.";
  const { hw, hd } = footprint(item, turn);
  const front = z + hd;
  const back = z - hd;
  if (back < WALK_BOUNDS.minZ || front > WALK_BOUNDS.maxZ) return "Keep it inside the room.";
  if (Math.abs(x) + hw > Math.min(halfWidthAt(front), halfWidthAt(back)) + 1e-9) return "Keep it inside the room.";
  const nx = Math.max(x - hw, Math.min(HOME_DOOR.x, x + hw));
  const nz = Math.max(back, Math.min(HOME_DOOR.z, front));
  if (Math.hypot(nx - HOME_DOOR.x, nz - HOME_DOOR.z) < DOOR_CLEAR) return "Keep the doorway clear.";
  return null;
};

export const blocksBackDoor = (item: FurnitureId, x: number, z: number, turn: number) => {
  const { hw, hd } = footprint(item, turn);
  const nx = Math.max(x - hw, Math.min(BACK_DOOR.x, x + hw));
  const nz = Math.max(z - hd, Math.min(BACK_DOOR.z, z + hd));
  return Math.hypot(nx - BACK_DOOR.x, nz - BACK_DOOR.z) < DOOR_CLEAR;
};

export const fitInRoom = (item: FurnitureId, x: number, z: number, turn: Turn): { x: number; z: number } | null => {
  const { hw, hd } = footprint(item, turn);
  const cz = Math.min(WALK_BOUNDS.maxZ - hd, Math.max(WALK_BOUNDS.minZ + hd, z));
  const half = Math.min(halfWidthAt(cz + hd), halfWidthAt(cz - hd)) - hw;
  if (half < 0) return null;
  const fits = (at: { x: number; z: number }) => placementProblem(item, at.x, at.z, turn) === null && !blocksBackDoor(item, at.x, at.z, turn);
  const spot = { x: Math.min(half, Math.max(-half, x)), z: cz };
  const tries = [
    spot,
    { x: spot.x, z: Math.min(spot.z, HOME_DOOR.z - DOOR_CLEAR - hd - 0.01) },
    { x: spot.x, z: Math.max(spot.z, BACK_DOOR.z + DOOR_CLEAR + hd + 0.01) },
  ];
  return tries.find(fits) ?? null;
};

export const homeObstacles = (items: readonly Placed[]) =>
  items.flatMap((p) => {
    if (!isFurniture(p.item) || !FURNITURE[p.item].solid || blocksBackDoor(p.item, p.x, p.z, p.turn)) return [];
    const { hw, hd } = footprint(p.item, p.turn);
    return [{ id: p.key, x: p.x, z: p.z, rx: hw + 0.15, rz: hd + 0.15 }];
  });

export const ownedLeft = (owned: Record<string, number> | undefined, placed: readonly Placed[], item: string) =>
  (owned?.[item] ?? 0) - placed.filter((p) => p.item === item).length;

/**
 * Where you sit on the pieces that seat people, in the piece's own frame
 * (facing +z, as `turn` 0 draws it), and how high the seat is. A sofa seats
 * two side by side, and the bed two on the edge at its foot. A desk has no
 * chair drawn at it, so it stays something you walk round.
 */
const SITS: Partial<Record<FurnitureId, { spots: [number, number][]; height: number }>> = {
  chair: { spots: [[0, 0.02]], height: CHAIR_HEIGHT },
  beanbag: { spots: [[0, 0.1]], height: ARMCHAIR_HEIGHT },
  sofa: { spots: [[-0.42, 0.1], [0.42, 0.1]], height: COUCH_HEIGHT },
  bed: { spots: [[-0.38, 0.8], [0.38, 0.8]], height: 0.46 },
};

export const isSittable = (item: string) => isFurniture(item) && SITS[item] !== undefined;

/**
 * The seats on a home's placed furniture, `<key>-<n>` like the café couch's,
 * each facing the way its piece faces (turned toward the camera, as every
 * seat outside the Chapel is).
 */
export const homeSeats = (items: readonly Placed[]): Seat[] =>
  items.flatMap((p) => {
    const sit = isFurniture(p.item) ? SITS[p.item] : undefined;
    if (!sit || !isTurn(p.turn)) return [];
    const a = (p.turn * Math.PI) / 2;
    const c = Math.round(Math.cos(a));
    const s = Math.round(Math.sin(a));
    const spots = sit.spots.map(([lx, lz]): [number, number] => [p.x + lx * c + lz * s, p.z - lx * s + lz * c]);
    return along(p.key, spots, towardCamera(a, p.x), sit.height);
  });

/** Every seat in a place: the fixed ones, or at a home, its furniture's. */
export const seatsHere = (place: Place, items: readonly Placed[] | undefined): readonly Seat[] =>
  place === HOME ? homeSeats(items ?? []) : SEATS[place];

export const seatHere = (place: Place, id: string | undefined, items: readonly Placed[] | undefined): Seat | null =>
  id === undefined ? null : (seatsHere(place, items).find((seat) => seat.id === id) ?? null);

/** The placed piece a home seat is on (its key), so a tap on a full sofa never sits you on the chair beside it. */
export const homeSeatPiece = (seatId: string) => seatId.slice(0, seatId.lastIndexOf("-"));
