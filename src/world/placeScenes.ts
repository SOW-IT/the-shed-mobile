import { PLACE_OBSTACLES, type Place } from "@shared/world";
import type { Camera, Vec3 } from "./camera";
import { boxOf, buildGarden, Builder, depthOf, drawPads, type Prop, type Scene } from "./gardenScene";
import { garden, places } from "./palette";

type Draw = (p: Builder) => void;

const propsFor = (cam: Camera) => {
  const props: Prop[] = [];
  const add = (id: string, x: number, z: number, draw: Draw) => {
    const p = new Builder(cam, id);
    draw(p);
    const prims = p.take();
    props.push({ id, depth: depthOf(cam, x, z), prims, box: boxOf(prims) });
  };
  return { props, add };
};

const floorWithPlanks = (g: Builder, floor: string, plank: string) => {
  g.groundDisc(0, -2, 34, 34, floor);
  for (let z = -16; z <= 10; z += 2) {
    g.groundQuad([[-9, z - 0.5], [9, z - 0.5], [9, z + 0.5], [-9, z + 0.5]], plank);
  }
};

const roomWalls = (b: Builder, cam: Camera, wall: string, onBackWall: (z: number) => void) => {
  const sides: [number, number, number, number, number][] = [
    [-4.8, -6, 0.6, 8.6, 1.5],
    [4.8, -6, 0.6, 8.6, 1.5],
    [-5.6, 4.4, 0.6, 6.2, 1.2],
    [5.6, 4.4, 0.6, 6.2, 1.2],
  ];
  const parts: { depth: number; draw: () => void }[] = sides.map(([x, z, w, d, h]) => ({
    depth: depthOf(cam, x, z + d / 2),
    draw: () => b.box(x, h / 2, z, w, h, d, wall, 0.05),
  }));
  parts.push({
    depth: depthOf(cam, 0, -12.2),
    draw: () => {
      b.box(0, 2.3, -12.4, 11.4, 4.6, 0.4, wall, 0.05);
      onBackWall(-12.19);
    },
  });
  parts.sort((p, q) => q.depth - p.depth).forEach((part) => part.draw());
};

const panel = (b: Builder, x: number, y: number, z: number, w: number, h: number, fill: string) =>
  b.face(
    [
      [x - w / 2, y + h / 2, z],
      [x + w / 2, y + h / 2, z],
      [x + w / 2, y - h / 2, z],
      [x - w / 2, y - h / 2, z],
    ],
    fill
  );

const obstacle = (place: Place, id: string) => PLACE_OBSTACLES[place].find((o) => o.id === id)!;

const buildChapel = (cam: Camera): Scene => {
  const c = places.chapel;
  const g = new Builder(cam, "g");
  floorWithPlanks(g, c.floor, c.plank);
  g.groundQuad([[-4.5, -11.8], [4.5, -11.8], [4.5, -7.3], [-4.5, -7.3]], c.stage);
  g.groundQuad([[-4.5, -7.3], [4.5, -7.3], [4.5, -7.1], [-4.5, -7.1]], c.woodDark);
  g.groundQuad([[-0.95, -7.1], [0.95, -7.1], [0.95, 9], [-0.95, 9]], c.carpetEdge);
  g.groundQuad([[-0.8, -7.1], [0.8, -7.1], [0.8, 9], [-0.8, 9]], c.carpet);
  drawPads(g, "chapel");
  const ground = g.take();

  const b = new Builder(cam, "b");
  roomWalls(b, cam, c.wall, (z) => {
    for (const x of [-3.4, 3.4]) {
      panel(b, x, 2.7, z, 1.5, 2.5, garden.ink);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          panel(b, x - 0.34 + col * 0.68, 3.45 - row * 0.76, z + 0.01, 0.6, 0.68, c.glass[(row + col) % c.glass.length]);
        }
      }
    }
    b.box(0, 2.9, z + 0.08, 0.26, 2.3, 0.12, c.wood);
    b.box(0, 3.35, z + 0.08, 1.3, 0.26, 0.12, c.wood);
    b.box(0, 0.5, -11.5, 2.4, 1.0, 0.8, c.cloth);
    for (const x of [-0.8, 0.8]) {
      b.cylinder(x, -11.5, 1.0, 1.5, 0.06, 0.06, c.candle);
      b.ball([x, 1.62, -11.5], 0.1, c.flame, { ink: 0.02 });
    }
  });
  const backdrop = b.take();

  const { props, add } = propsFor(cam);
  for (const pew of PLACE_OBSTACLES.chapel.filter((o) => o.id.startsWith("pew"))) {
    add(pew.id, pew.x, pew.z + 0.3, (p) => {
      p.box(pew.x, 0.25, pew.z - 0.05, 2.5, 0.5, 0.55, c.wood);
      p.box(pew.x, 0.6, pew.z + 0.28, 2.5, 1.2, 0.14, c.wood);
    });
  }
  const lectern = obstacle("chapel", "lectern");
  add("lectern", lectern.x, lectern.z, (p) => {
    p.box(lectern.x, 0.6, lectern.z, 0.6, 1.2, 0.5, c.woodDark);
    p.box(lectern.x, 1.26, lectern.z, 0.8, 0.1, 0.62, c.wood);
    p.face(
      [
        [lectern.x - 0.25, 1.32, lectern.z - 0.2],
        [lectern.x + 0.25, 1.32, lectern.z - 0.2],
        [lectern.x + 0.25, 1.32, lectern.z + 0.2],
        [lectern.x - 0.25, 1.32, lectern.z + 0.2],
      ],
      c.cloth
    );
  });
  const piano = obstacle("chapel", "piano");
  add("piano", piano.x, piano.z, (p) => {
    p.box(piano.x, 0.6, piano.z, 1.8, 1.2, 0.8, c.piano);
    p.box(piano.x, 0.78, piano.z + 0.5, 1.6, 0.1, 0.24, c.keys);
    p.cylinder(piano.x, piano.z + 1.0, 0, 0.45, 0.22, 0.24, c.carpet);
  });
  return { sky: c.sky, ground, backdrop, props };
};

const PINES: [number, number, number][] = [
  [-6.4, -13, 1.5],
  [-2.6, -15, 1.7],
  [1.8, -15.5, 1.5],
  [6.2, -13.5, 1.7],
  [-7.2, -6, 1.4],
  [7.4, -5, 1.5],
  [-7.4, 2, 1.3],
  [7.6, 3, 1.3],
];

const buildCampfire = (cam: Camera): Scene => {
  const c = places.campfire;
  const g = new Builder(cam, "g");
  g.groundDisc(0, -2, 34, 34, c.grass);
  for (let z = -16; z <= 10; z += 2) {
    g.groundQuad([[-9, z - 0.5], [9, z - 0.5], [9, z + 0.5], [-9, z + 0.5]], c.stripe);
  }
  const fire = obstacle("campfire", "fire");
  g.groundDisc(fire.x, fire.z, 3.5, 3.1, c.dirt);
  g.groundDisc(fire.x, fire.z, 2.7, 2.4, c.glow);
  g.groundDisc(fire.x, fire.z, 1.5, 1.3, c.glow);
  drawPads(g, "campfire");
  const ground = g.take();

  const b = new Builder(cam, "b");
  const pines = [...PINES].sort((p, q) => depthOf(cam, q[0], q[1]) - depthOf(cam, p[0], p[1]));
  for (const [x, z, s] of pines) {
    b.cylinder(x, z, 0, 0.9 * s, 0.2 * s, 0.16 * s, c.trunk);
    b.cylinder(x, z, 0.8 * s, 2.3 * s, 1.15 * s, 0.5 * s, c.pine);
    b.cylinder(x, z, 1.9 * s, 3.2 * s, 0.85 * s, 0.3 * s, c.pineLight);
    b.cylinder(x, z, 2.9 * s, 4.0 * s, 0.55 * s, 0.04 * s, c.pine);
  }
  const backdrop = b.take();

  const { props, add } = propsFor(cam);
  add("fire", fire.x, fire.z, (p) => {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      p.ball([fire.x + Math.cos(a) * 0.8, 0.12, fire.z + Math.sin(a) * 0.7], 0.17, c.stone, { ink: 0.025 });
    }
    p.box(fire.x, 0.14, fire.z, 1.0, 0.2, 0.22, c.log);
    p.box(fire.x, 0.3, fire.z, 0.22, 0.2, 0.9, c.log);
    p.ball([fire.x, 0.75, fire.z], 0.46, c.flame, { ink: 0.02, squashY: 1.25 });
    p.ball([fire.x - 0.05, 0.68, fire.z + 0.02], 0.27, c.flameHot, { ink: 0, squashY: 1.3 });
  });
  for (const id of ["log-back", "log-left", "log-right"]) {
    const log = obstacle("campfire", id);
    add(id, log.x, log.z, (p) => p.box(log.x, 0.22, log.z, log.rx * 1.8, 0.44, log.rz * 1.8, c.log));
  }
  for (const [id, colour] of [["tent-left", c.tentA], ["tent-right", c.tentB]] as const) {
    const tent = obstacle("campfire", id);
    add(id, tent.x, tent.z, (p) => {
      p.ball([tent.x, 0.6, tent.z], 1.3, colour, { squashY: 0.74, ink: 0.05 });
      p.ball([tent.x, 0.42, tent.z + 0.5], 0.5, c.tentDoor, { squashY: 1.05, ink: 0.02 });
    });
  }
  add("lantern", -3.7, 4.6, (p) => {
    p.cylinder(-3.7, 4.6, 0, 1.3, 0.05, 0.05, c.trunk);
    p.ball([-3.7, 1.45, 4.6], 0.2, c.lantern, { ink: 0.03 });
  });
  return { sky: c.sky, ground, backdrop, props };
};

const buildCafe = (cam: Camera): Scene => {
  const c = places.cafe;
  const g = new Builder(cam, "g");
  floorWithPlanks(g, c.floor, c.plank);
  g.groundDisc(0.6, 1.6, 2.5, 1.9, c.rug);
  g.groundDisc(0.6, 1.6, 2.1, 1.55, c.rugInner);
  g.groundDisc(0.6, 1.6, 1.7, 1.2, c.rug);
  drawPads(g, "cafe");
  const ground = g.take();

  const b = new Builder(cam, "b");
  roomWalls(b, cam, c.wall, (z) => {
    panel(b, 0, 3.0, z, 3.6, 1.9, garden.ink);
    panel(b, 0, 3.0, z + 0.01, 3.4, 1.7, c.board);
    for (let i = 0; i < 4; i++) panel(b, -0.5, 3.5 - i * 0.34, z + 0.02, 1.8 - (i % 2) * 0.5, 0.07, c.chalk);
    panel(b, 1.2, 2.5, z + 0.02, 0.5, 0.5, c.chalk);
    for (const x of [-3.9, 3.9]) {
      panel(b, x, 2.9, z, 1.7, 2.1, garden.ink);
      panel(b, x, 2.9, z + 0.01, 1.5, 1.9, c.window);
      panel(b, x, 2.9, z + 0.02, 0.08, 1.9, c.wall);
    }
  });
  const backdrop = b.take();

  const { props, add } = propsFor(cam);
  const counter = obstacle("cafe", "counter");
  add("counter", counter.x, counter.z, (p) => {
    p.box(counter.x, 0.55, counter.z, 5.4, 1.1, 1.0, c.counter);
    p.box(counter.x, 1.15, counter.z, 5.7, 0.1, 1.25, c.counterTop);
    p.box(-1.7, 1.55, counter.z - 0.1, 0.9, 0.7, 0.6, c.steel);
    p.cylinder(-1.7, counter.z + 0.35, 1.2, 1.38, 0.09, 0.1, c.cup);
    p.cylinder(0.3, counter.z, 1.2, 1.3, 0.34, 0.34, c.cup);
    p.ball([0.3, 1.46, counter.z], 0.26, c.cake, { ink: 0.025, squashY: 0.7 });
    for (const x of [1.5, 1.9, 2.3]) p.cylinder(x, counter.z + 0.2, 1.2, 1.4, 0.09, 0.1, c.cup);
  });
  for (const id of ["table-a", "table-b", "table-c"]) {
    const table = obstacle("cafe", id);
    add(id, table.x, table.z, (p) => {
      p.groundDisc(table.x - 0.25, table.z - 0.2, 0.75, 0.55, garden.shadow);
      for (const side of [-1, 1]) p.cylinder(table.x + side * 0.6, table.z + 0.1, 0, 0.45, 0.17, 0.19, c.stool);
      p.cylinder(table.x, table.z, 0, 0.74, 0.09, 0.09, c.leg);
      p.cylinder(table.x, table.z, 0.74, 0.82, 0.56, 0.56, c.table);
      p.cylinder(table.x - 0.15, table.z + 0.05, 0.83, 0.97, 0.07, 0.08, c.cup);
    });
  }
  const couch = obstacle("cafe", "couch");
  add("couch", couch.x, couch.z, (p) => {
    p.box(couch.x, 0.6, couch.z - 0.38, 2.3, 1.2, 0.26, c.couch);
    p.box(couch.x, 0.28, couch.z, 2.3, 0.56, 0.9, c.couch);
    for (const side of [-1, 1]) p.box(couch.x + side * 1.05, 0.45, couch.z, 0.24, 0.9, 0.9, c.couch);
  });
  const plant = obstacle("cafe", "plant");
  add("plant", plant.x, plant.z, (p) => {
    p.cylinder(plant.x, plant.z, 0, 0.5, 0.22, 0.3, c.pot);
    p.ball([plant.x, 1.0, plant.z], 0.5, c.plant, { ink: 0.04 });
    p.ball([plant.x + 0.25, 1.45, plant.z], 0.32, c.plant, { ink: 0.03 });
  });
  return { sky: c.sky, ground, backdrop, props };
};

const PALMS: [number, number, number][] = [
  [-6.2, -3.5, 1.2],
  [6.4, -1.5, 1.3],
  [-6.8, 4.5, 1.1],
];

const palm = (p: Builder, x: number, z: number, s: number) => {
  const c = places.beach;
  p.cylinder(x, z, 0, 2.6 * s, 0.17 * s, 0.11 * s, c.palmTrunk);
  const top: Vec3 = [x, 2.7 * s, z];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.ball([top[0] + Math.cos(a) * 0.62 * s, top[1] - 0.12 * s + Math.sin(a) * 0.18 * s, top[2]], 0.5 * s, i % 2 ? c.palm : c.palmLight, {
      ink: 0.035,
      squashY: 0.5,
    });
  }
  p.ball(top, 0.3 * s, c.palm, { ink: 0.03 });
};

const buildBeach = (cam: Camera): Scene => {
  const c = places.beach;
  const g = new Builder(cam, "g");
  g.groundDisc(0, -2, 34, 34, c.sand);
  for (const [x, z, rx] of [[-2.2, 5.2, 1.2], [1.4, 0.6, 1.5], [-0.6, -3.4, 1.3], [3.0, -0.6, 0.9], [-3.2, 2.4, 1.0]]) {
    g.groundDisc(x, z, rx, rx * 0.32, c.sandDark);
  }
  g.groundQuad([[-40, -5.4], [40, -5.4], [40, -6.6], [-40, -6.6]], c.wet);
  g.groundQuad([[-40, -60], [40, -60], [40, -9.2], [-40, -9.2]], c.sea);
  g.groundQuad([[-40, -9.2], [40, -9.2], [40, -6.4], [-40, -6.4]], c.shallow);
  for (let x = -11; x <= 11; x += 1.9) g.groundDisc(x, -6.4 + Math.sin(x * 1.7) * 0.14, 1.15, 0.2, c.foam);
  for (let x = -10; x <= 10; x += 2.6) g.groundDisc(x, -9.2 + Math.cos(x) * 0.12, 1.0, 0.12, c.foam);
  const umbrella = obstacle("beach", "umbrella");
  for (let i = 0; i < 4; i++) {
    const x = umbrella.x + 0.5 + i * 0.28;
    g.groundQuad([[x, umbrella.z - 0.2], [x + 0.28, umbrella.z - 0.2], [x + 0.28, umbrella.z + 1.4], [x, umbrella.z + 1.4]], i % 2 ? c.towelStripe : c.towel, 0.01);
  }
  for (let z = 6.1; z < 9; z += 0.5) {
    g.groundQuad([[-1.5, z], [1.5, z], [1.5, z + 0.5], [-1.5, z + 0.5]], Math.round(z * 2) % 2 ? c.plank : c.plankDark, 0.008);
  }
  drawPads(g, "beach");
  const ground = g.take();

  const b = new Builder(cam, "b");
  for (const [x, z, s] of [[-5.6, -5.2, 0.7], [-6.3, -4.6, 0.45], [5.8, -6.0, 0.6]]) b.ball([x, 0.3 * s, z], s, c.rock, { ink: 0.04, squashY: 0.7 });
  const palms = [...PALMS].sort((p, q) => depthOf(cam, q[0], q[1]) - depthOf(cam, p[0], p[1]));
  for (const [x, z, s] of palms) palm(b, x, z, s);
  const backdrop = b.take();

  const { props, add } = propsFor(cam);
  add("umbrella", umbrella.x, umbrella.z, (p) => {
    p.cylinder(umbrella.x, umbrella.z, 0, 2.0, 0.05, 0.05, c.pole);
    p.ball([umbrella.x, 2.05, umbrella.z], 1.25, c.umbrella, { ink: 0.05, squashY: 0.42 });
    p.ball([umbrella.x, 2.2, umbrella.z], 0.62, c.umbrellaStripe, { ink: 0, squashY: 0.42 });
    p.ball([umbrella.x, 2.36, umbrella.z], 0.12, c.umbrella, { ink: 0.02 });
  });
  const castle = obstacle("beach", "castle");
  add("castle", castle.x, castle.z, (p) => {
    p.cylinder(castle.x, castle.z, 0, 0.45, 0.6, 0.52, c.castle);
    p.cylinder(castle.x, castle.z, 0.45, 0.85, 0.34, 0.3, c.castle);
    for (const side of [-1, 1]) p.cylinder(castle.x + side * 0.5, castle.z + 0.1, 0, 0.62, 0.17, 0.15, c.castle);
    p.line([castle.x, 0.85, castle.z], [castle.x, 1.25, castle.z], 2, garden.ink);
    p.face(
      [
        [castle.x, 1.25, castle.z],
        [castle.x + 0.3, 1.18, castle.z],
        [castle.x + 0.3, 1.04, castle.z],
        [castle.x, 1.08, castle.z],
      ],
      c.flag
    );
  });
  const left = obstacle("beach", "net-left");
  const right = obstacle("beach", "net-right");
  add("net", 0, left.z, (p) => {
    for (const post of [left, right]) p.cylinder(post.x, post.z, 0, 1.6, 0.06, 0.06, c.post);
    for (const y of [1.5, 1.2, 0.9]) p.line([left.x, y, left.z], [right.x, y, right.z], y === 1.5 ? 3 : 1.5, c.net);
    for (let x = left.x + 0.34; x < right.x; x += 0.34) p.line([x, 1.5, left.z], [x, 0.9, left.z], 1.2, c.net);
  });
  add("ball", 2.9, 1.2, (p) => {
    p.groundDisc(2.8, 1.1, 0.26, 0.18, garden.shadow);
    p.ball([2.9, 0.26, 1.2], 0.26, c.ball, { ink: 0.03 });
  });
  const inBounds = obstacle("beach", "palm");
  add("palm", inBounds.x, inBounds.z, (p) => {
    p.groundDisc(inBounds.x - 0.5, inBounds.z - 0.3, 0.9, 0.6, garden.shadow);
    palm(p, inBounds.x, inBounds.z, 1);
  });
  return { sky: c.sky, ground, backdrop, props };
};

const BUILDERS: Record<Place, (cam: Camera) => Scene> = {
  garden: buildGarden,
  chapel: buildChapel,
  campfire: buildCampfire,
  cafe: buildCafe,
  beach: buildBeach,
};

export const buildScene = (place: Place, cam: Camera): Scene => BUILDERS[place](cam);
