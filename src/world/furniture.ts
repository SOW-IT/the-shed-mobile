import type { FurnitureId, WallpaperId } from "@shared/home";
import type { Builder } from "./gardenScene";
import { garden, home, wallpapers } from "./palette";

type Turned = {
  box: (lx: number, y: number, lz: number, w: number, h: number, d: number, fill: string) => void;
  cylinder: (lx: number, lz: number, y0: number, y1: number, r0: number, r1: number, fill: string) => void;
  ball: (lx: number, y: number, lz: number, r: number, fill: string, squashY?: number) => void;
  flat: (corners: [number, number][], fill: string, y?: number) => void;
};

const turned = (b: Builder, x: number, z: number, turn: number): Turned => {
  const a = (turn * Math.PI) / 2;
  const c = Math.round(Math.cos(a));
  const s = Math.round(Math.sin(a));
  const at = (lx: number, lz: number) => ({ x: x + lx * c + lz * s, z: z - lx * s + lz * c });
  const odd = turn % 2 === 1;
  return {
    box: (lx, y, lz, w, h, d, fill) => {
      const p = at(lx, lz);
      b.box(p.x, y, p.z, odd ? d : w, h, odd ? w : d, fill);
    },
    cylinder: (lx, lz, y0, y1, r0, r1, fill) => {
      const p = at(lx, lz);
      b.cylinder(p.x, p.z, y0, y1, r0, r1, fill);
    },
    ball: (lx, y, lz, r, fill, squashY) => {
      const p = at(lx, lz);
      b.ball([p.x, y, p.z], r, fill, { ink: 0.025, squashY });
    },
    flat: (corners, fill, y = 0.01) => {
      b.groundQuad(
        corners.map(([lx, lz]) => {
          const p = at(lx, lz);
          return [p.x, p.z] as [number, number];
        }),
        fill,
        y
      );
    },
  };
};

const DRAW: Record<FurnitureId, (t: Turned) => void> = {
  rug: (t) => {
    t.flat([[-1.2, -0.8], [1.2, -0.8], [1.2, 0.8], [-1.2, 0.8]], home.rug);
    t.flat([[-0.95, -0.58], [0.95, -0.58], [0.95, 0.58], [-0.95, 0.58]], home.rugInner, 0.012);
    t.flat([[-0.7, -0.36], [0.7, -0.36], [0.7, 0.36], [-0.7, 0.36]], home.rug, 0.014);
  },
  plant: (t) => {
    t.cylinder(0, 0, 0, 0.38, 0.2, 0.26, home.pot);
    t.ball(0, 0.72, 0, 0.36, home.leaf);
    t.ball(0.18, 1.0, 0.04, 0.24, home.leafLight);
  },
  lamp: (t) => {
    t.cylinder(0, 0, 0, 0.06, 0.2, 0.18, home.metal);
    t.cylinder(0, 0, 0.06, 1.15, 0.03, 0.03, home.metal);
    t.cylinder(0, 0, 1.0, 1.35, 0.26, 0.14, home.shade);
  },
  chair: (t) => {
    for (const [lx, lz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) t.box(lx, 0.14, lz, 0.06, 0.28, 0.06, home.woodDark);
    t.box(0, 0.31, 0, 0.56, 0.06, 0.56, home.wood);
    t.box(0, 0.6, -0.25, 0.56, 0.55, 0.06, home.wood);
  },
  beanbag: (t) => {
    t.ball(0, 0.26, 0.05, 0.44, home.beanbag, 0.62);
    t.ball(0, 0.42, -0.2, 0.3, home.beanbag, 0.8);
  },
  table: (t) => {
    for (const [lx, lz] of [[-0.55, -0.32], [0.55, -0.32], [-0.55, 0.32], [0.55, 0.32]]) t.box(lx, 0.25, lz, 0.08, 0.5, 0.08, home.woodDark);
    t.box(0, 0.53, 0, 1.3, 0.07, 0.8, home.wood);
    t.cylinder(-0.25, 0.05, 0.57, 0.68, 0.07, 0.08, home.cup);
  },
  bookshelf: (t) => {
    t.box(0, 0.65, 0, 1.4, 1.3, 0.42, home.woodDark);
    for (const [i, y] of [0.25, 0.65, 1.05].entries()) {
      for (let k = 0; k < 6; k++) t.box(-0.52 + k * 0.2 + (i % 2) * 0.05, y, 0.12, 0.14, 0.28 - (k % 3) * 0.04, 0.22, home.books[(k + i) % home.books.length]);
    }
  },
  desk: (t) => {
    t.box(-0.5, 0.27, 0, 0.36, 0.54, 0.66, home.wood);
    t.box(0.62, 0.27, 0, 0.08, 0.54, 0.62, home.woodDark);
    t.box(0, 0.58, 0, 1.4, 0.07, 0.7, home.wood);
    t.box(-0.5, 0.35, 0.34, 0.24, 0.05, 0.02, home.metal);
    t.box(0.15, 0.78, -0.15, 0.5, 0.34, 0.05, home.screen);
  },
  tv: (t) => {
    t.box(0, 0.22, 0, 1.4, 0.44, 0.48, home.woodDark);
    t.box(0, 0.86, -0.05, 1.3, 0.76, 0.08, home.tvFrame);
    t.box(0, 0.86, 0.0, 1.18, 0.64, 0.02, home.screen);
  },
  sofa: (t) => {
    t.box(0, 0.2, 0.05, 2.1, 0.4, 0.8, home.sofa);
    t.box(0, 0.55, -0.32, 2.1, 0.5, 0.18, home.sofa);
    for (const side of [-1, 1]) t.box(side * 0.96, 0.38, 0.05, 0.2, 0.36, 0.8, home.sofaDark);
    for (const side of [-1, 1]) t.box(side * 0.42, 0.44, 0.08, 0.8, 0.08, 0.6, home.cushion);
  },
  fireplace: (t) => {
    t.box(0, 0.6, -0.05, 1.6, 1.2, 0.5, home.brick);
    t.box(0, 1.24, 0.0, 1.8, 0.08, 0.6, home.mantel);
    t.box(0, 0.38, 0.21, 0.8, 0.6, 0.02, garden.ink);
    t.ball(0, 0.34, 0.22, 0.2, home.flame, 1.3);
    t.ball(0, 0.3, 0.23, 0.11, home.flameHot, 1.3);
  },
  bed: (t) => {
    t.box(0, 0.18, 0, 1.5, 0.36, 2.2, home.woodDark);
    t.box(0, 0.42, 0.05, 1.42, 0.14, 2.06, home.sheet);
    t.box(0, 0.5, 0.45, 1.44, 0.08, 1.2, home.blanket);
    t.box(0, 0.54, -0.75, 0.9, 0.12, 0.4, home.pillow);
    t.box(0, 0.6, -1.08, 1.5, 0.8, 0.08, home.woodDark);
  },
};

export const drawFurniture = (b: Builder, item: FurnitureId, x: number, z: number, turn: number) => DRAW[item](turned(b, x, z, turn));

export const WALLPAPER_LOOKS: Record<WallpaperId, { base: string; accent: string; pattern: "plain" | "stripes" | "dots" | "check" | "stars" }> = wallpapers;
