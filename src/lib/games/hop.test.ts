import { describe, expect, test } from "vitest";
import { CURRENT_GAME_VERSION, SCORE_LIMITS, scoreProblem } from "../../../shared/games";
import {
  autoSteer,
  CORRIDOR_DEPTH,
  dropFloor,
  flightClimb,
  flightRise,
  HOP_MAX_SCORE,
  HOP_PREVIEWS,
  hopAt,
  hopCatching,
  hopDifficulty,
  hopRise,
  hopPage,
  hopScore,
  isHopPreview,
  JUMP_RISE,
  landingTime,
  layRoute,
  MAX_ROUTE_GAP,
  newHop,
  previewHop,
  routeReach,
  seamDistance,
  sideReach,
  SPRING_RISE,
  stageWeights,
  steerSpeed,
  stepHop,
  withSteer,
  worstTrip,
  wrapX,
  type HopPalette,
  type HopPlatform,
  type HopState,
} from "./hop";
import { HOP, HOP_DIFFICULTY, HOP_LEVELS, HOP_PACE, HOP_STAGES } from "./hopTuning";

const W = 390;
const H = 700;
const FRAME = 1 / 60;
/** Board heights Hop is shown at: a short web window to a tall phone (GAME_VIEWS.hop). */
const HEIGHTS = [640, 760, 900];
const HALF_OVERLAP = HOP.platform.width / 2 + HOP.box.width / 2;
/** Close enough to a platform's middle to let go and glide onto it. */
const PW_HALF_TARGET = HOP.platform.width / 4;

/** A run with only these platforms, and nothing more laid as it climbs. */
const bare = (platforms: Partial<HopPlatform>[], over: Partial<HopState> = {}): HopState => ({
  ...newHop(W, H, 1),
  platforms: platforms.map((p, i) => ({ id: 100 + i, kind: "normal", x: W / 2, y: 0, route: true, landedAt: null, ...p })),
  gen: { y: 1e9, x: 0, spread: 0 },
  corridors: [],
  boostClearAt: 1e9,
  ...over,
});

const play = (state: HopState, seconds: number, dt = FRAME, each?: (s: HopState, before: HopState) => void) => {
  let current = state;
  for (let t = 0; t < seconds - 1e-9 && !current.over; t += dt) {
    const before = current;
    current = stepHop(current, Math.min(dt, seconds - t));
    each?.(current, before);
  }
  return current;
};

const apexAfter = (state: HopState) => {
  let current = state;
  let top = current.y;
  while (current.vy > 0 && !current.over) {
    current = stepHop(current, FRAME);
    top = Math.max(top, current.y);
  }
  return top;
};

describe("bouncing", () => {
  test("a platform below the bottom of the board can't save you: the run ends instead", () => {
    // The camera is at 0, so the run ends once your feet are below -box height.
    const floor = -HOP.box.height;
    const start = bare([{ y: floor - 6 }], { y: floor + 2, vy: -600, camera: 0, top: 500, landedAt: null });
    const state = stepHop(start, FRAME);
    expect(state.landedAt).toBeNull();
    expect(state.platforms[0].landedAt).toBeNull();
    expect(state.vy).toBeLessThan(0);
    expect(state.dying).not.toBeNull();
    // One just above the line still bounces you.
    const saved = stepHop(bare([{ y: floor + 1 }], { y: floor + 6, vy: -600, camera: 0, top: 500, landedAt: null }), FRAME);
    expect(saved.landedAt).not.toBeNull();
    expect(saved.dying).toBeNull();
  });

  test("a boost below the bottom of the board isn't picked up in the step the run ends", () => {
    const floor = -HOP.box.height;
    const item = { kind: "propeller" as const, offset: 0 };
    const start = bare([{ y: floor - 20, item }], { y: floor + 2, vy: -600, camera: 0, top: 500, landedAt: null });
    const state = stepHop(start, FRAME);
    expect(state.flight).toBeNull();
    expect(state.platforms[0].item).toEqual(item);
    expect(state.dying).not.toBeNull();
  });

  test("coming down onto a platform bounces you at jump speed", () => {
    const state = stepHop(bare([{ y: 0 }], { y: 4, vy: -300 }), FRAME);
    expect(state.vy).toBeCloseTo(HOP.jumpSpeed - HOP.gravity * (FRAME - 4 / 300), -1);
    expect(state.landedAt).not.toBeNull();
    expect(state.platforms[0].landedAt).not.toBeNull();
  });

  test("a bounce rises vJ² / 2g, and the route never asks for more than that less a margin", () => {
    expect(JUMP_RISE).toBeCloseTo((HOP.jumpSpeed * HOP.jumpSpeed) / (2 * HOP.gravity));
    const top = apexAfter(bare([], { y: 0, vy: HOP.jumpSpeed }));
    expect(top).toBeCloseTo(JUMP_RISE, 0);
    expect(MAX_ROUTE_GAP).toBe(JUMP_RISE - HOP.landingMargin);
    expect(hopDifficulty(1e9).gapMax).toBeLessThanOrEqual(MAX_ROUTE_GAP);
  });

  test("rising through a platform from below passes it", () => {
    const state = play(bare([{ y: 40 }], { y: 0, vy: HOP.jumpSpeed }), 0.1);
    expect(state.y).toBeGreaterThan(40);
    expect(state.landedAt).toBe(0);
    expect(state.platforms[0].landedAt).toBeNull();
  });

  test("missing a platform to the side falls past it", () => {
    const state = play(bare([{ y: 0, x: W / 2 + HALF_OVERLAP + 2 }], { y: 10, vy: 0 }), 0.2);
    expect(state.y).toBeLessThan(0);
    expect(state.platforms[0].landedAt).toBeNull();
  });

  test("in one long step the first top you come down on wins, and only it", () => {
    const state = stepHop(bare([{ y: -40 }, { y: -10 }], { y: 0, vy: -400 }), 0.2);
    expect(state.platforms.find((p) => p.y === -10)?.landedAt).not.toBeNull();
    expect(state.platforms.find((p) => p.y === -40)?.landedAt).toBeNull();
    expect(state.vy).toBeGreaterThan(0);
  });

  test("two tops at the same height: the earlier platform wins, the same way every time", () => {
    const platforms = [{ y: -10, x: W / 2 - 10 }, { y: -10, x: W / 2 + 10 }];
    const a = stepHop(bare(platforms, { y: 0, vy: -400 }), 0.1);
    const b = stepHop(bare(platforms, { y: 0, vy: -400 }), 0.1);
    expect(a.platforms.map((p) => p.landedAt !== null)).toEqual([true, false]);
    expect(b).toEqual(a);
  });

  test("a platform can't be bounced on twice in one step", () => {
    let hits = 0;
    play(bare([{ y: 0 }], { y: 1, vy: -100 }), 0.9, FRAME, (s, before) => {
      if (s.landedAt !== before.landedAt) hits++;
    });
    // A bounce lasts about a second: one landing, not one a frame.
    expect(hits).toBe(1);
  });

  test("you land across the seam: off the right edge onto a platform hanging over the left", () => {
    const state = stepHop(bare([{ y: 0, x: 10 }], { x: W - 3, y: 3, vy: -300 }), FRAME);
    expect(seamDistance(W - 3, 10, W)).toBe(13);
    expect(state.platforms[0].landedAt).not.toBeNull();
  });

  test("x wraps round continuously, never jumping inside the board", () => {
    const state = play(bare([], { x: W - 5, vx: HOP.maxSpeed, steer: 1, y: 1000, vy: 0, camera: 0 }), 0.1);
    expect(state.x).toBeGreaterThan(0);
    expect(state.x).toBeLessThan(40);
    expect(wrapX(-1, W)).toBe(W - 1);
  });

  test("a fast moving platform passing under you in one step still catches you", () => {
    // At the start and end of the step it's well to either side; at the moment you cross its top it's under you.
    const vy = -200;
    const tau = 0.05;
    const y = -vy * tau + 0.5 * HOP.gravity * tau * tau;
    const track = { centre: W / 2, range: 130, speed: 2400, dir: 1 as const };
    const start = bare([{ kind: "moving", y: 0, x: W / 2 - 120, track }], { y, vy });
    const state = stepHop(start, 0.1);
    expect(Math.abs(state.platforms[0].x - W / 2)).toBeGreaterThan(HALF_OVERLAP);
    expect(state.platforms[0].landedAt).toBeCloseTo(tau, 3);
    expect(state.vy).toBeGreaterThan(0);
  });

  test("a moving platform that turns at the end of its track during a step is caught where it really was", () => {
    // Heading right, 10 short of the end: in 0.05 s it reaches the end and comes back 10.
    const track = { centre: W / 2, range: 60, speed: 400, dir: 1 as const };
    const end = W / 2 + 60;
    const vy = -200;
    const tau = 0.05;
    const y = -vy * tau + 0.5 * HOP.gravity * tau * tau;
    // You're in reach of where it turned back to, but not of where it would be
    // had it gone the way it faces after the step (end - 30).
    const start = bare([{ kind: "moving", y: 0, x: end - 10, track }], { y, vy, x: end - 10 + HALF_OVERLAP - 2 });
    const state = stepHop(start, 0.1);
    expect(state.platforms[0].landedAt).toBeCloseTo(tau, 3);
    const outOfReach = bare([{ kind: "moving", y: 0, x: end - 10, track }], { y, vy, x: end - 10 + HALF_OVERLAP + 2 });
    expect(stepHop(outOfReach, 0.1).platforms[0].landedAt).toBeNull();
  });

  test("a moving platform turns at the ends of its track", () => {
    const track = { centre: 200, range: 50, speed: 100, dir: 1 as const };
    let state = bare([{ kind: "moving", x: 240, y: 650, track }], { x: 20, y: 900, vy: 0, camera: 600 });
    state = play(state, 0.5);
    const platform = state.platforms[0];
    expect(platform.track?.dir).toBe(-1);
    expect(platform.x).toBeCloseTo(250 - 40, 0);
  });
});

describe("platform kinds", () => {
  test("a breakable snaps under you with no bounce, and you keep falling", () => {
    const state = stepHop(bare([{ kind: "breakable", y: 0 }], { y: 3, vy: -300 }), FRAME);
    expect(state.platforms).toEqual([]);
    expect(state.vy).toBeLessThan(-300);
    expect(state.effects.map((e) => e.kind)).toEqual(["break"]);
  });

  test("falling through a breakable onto a platform below it, in the same step, does both in order", () => {
    const state = stepHop(bare([{ kind: "breakable", y: -10, id: 1 }, { y: -40 }], { y: 0, vy: -600 }), 0.1);
    expect(state.platforms.map((p) => p.kind)).toEqual(["normal"]);
    expect(state.platforms[0].landedAt).not.toBeNull();
    expect(state.effects.map((e) => e.kind)).toEqual(["break"]);
    expect(state.vy).toBeGreaterThan(0);
  });

  test("a breakable doesn't snap when you rise through it", () => {
    const state = play(bare([{ kind: "breakable", y: 50 }], { y: 0, vy: HOP.jumpSpeed }), 0.15);
    expect(state.platforms).toHaveLength(1);
    expect(state.effects).toEqual([]);
  });

  test("a one-bounce platform bounces you once, then crumbles to chalk", () => {
    let state = stepHop(bare([{ kind: "oneBounce", y: 0 }], { y: 3, vy: -300 }), FRAME);
    expect(state.vy).toBeGreaterThan(0);
    expect(state.platforms).toEqual([]);
    expect(state.effects.map((e) => e.kind)).toEqual(["chalk"]);
    // Gone for good: coming down again, there's nothing to land on.
    state = play(state, 1.2);
    expect(state.y).toBeLessThan(-50);
  });

  test("the chalk and the broken halves fade and are dropped", () => {
    const state = play(stepHop(bare([{ kind: "oneBounce", y: 0 }], { y: 3, vy: -300 }), FRAME), HOP.effectSeconds + 0.05);
    expect(state.effects).toEqual([]);
  });

  test("a spring sends you 2.2 times as high, from about sqrt(2.2) times the speed", () => {
    expect(HOP.springSpeed / HOP.jumpSpeed).toBeCloseTo(Math.sqrt(HOP.springHeight));
    expect(SPRING_RISE / JUMP_RISE).toBeCloseTo(HOP.springHeight);
    const state = stepHop(bare([{ y: 0, spring: { offset: 0, firedAt: null } }], { y: HOP.spring.height + 3, vy: -300 }), FRAME);
    expect(state.springAt).not.toBeNull();
    expect(state.platforms[0].spring?.firedAt).not.toBeNull();
    const rise = apexAfter(state) - HOP.spring.height;
    expect(rise / JUMP_RISE).toBeCloseTo(HOP.springHeight, 1);
  });

  test("a spring only fires when you come down on it", () => {
    const state = play(bare([{ y: 30, spring: { offset: 0, firedAt: null } }], { y: 0, vy: HOP.jumpSpeed }), 0.12);
    expect(state.springAt).toBeNull();
    expect(state.y).toBeGreaterThan(30 + HOP.spring.height);
  });

  test("landing on the platform beside its spring is an ordinary bounce", () => {
    const state = stepHop(bare([{ y: 0, x: W / 2 - 50, spring: { offset: -20, firedAt: null } }], { y: 3, vy: -300, x: W / 2 }), FRAME);
    expect(state.springAt).toBeNull();
    expect(state.landedAt).not.toBeNull();
  });
});

describe("boosts", () => {
  const withItem = (kind: "propeller" | "jetpack", more: Partial<HopPlatform>[] = []) =>
    bare([{ y: 0, item: { kind, offset: 0 } }, ...more], { y: 0, vy: HOP.jumpSpeed });

  test.each(["propeller", "jetpack"] as const)("a %s lifts you for its whole time, then lets go", (kind) => {
    let state = stepHop(withItem(kind), FRAME);
    expect(state.flight?.kind).toBe(kind);
    expect(state.platforms[0].item).toBeUndefined();
    expect(state.effects.map((e) => e.kind)).toEqual(["pickup"]);
    const at = state.flight?.at ?? 0;
    const from = state.y;
    state = play(state, HOP[kind].seconds - 0.05);
    expect(state.flight).not.toBeNull();
    expect(state.y - from).toBeCloseTo(flightClimb(kind, state.time - at), 0);
    state = play(state, 0.1);
    expect(state.flight).toBeNull();
    expect(state.effects.filter((e) => e.kind === "drop")).toHaveLength(1);
    // Back to gravity, carrying on up a little first.
    expect(state.vy).toBeLessThan(HOP.boostFade.endSpeed);
    expect(state.vy).toBeGreaterThan(0);
    expect(apexAfter(state) - from).toBeCloseTo(flightRise(kind), -1);
  });

  test("the jetpack is faster and lasts longer than the propeller", () => {
    expect(HOP.jetpack.speed).toBeGreaterThan(HOP.propeller.speed);
    expect(HOP.propeller.seconds).toBeCloseTo(2.5 / HOP_PACE);
    expect(HOP.jetpack.seconds).toBeCloseTo(3.5 / HOP_PACE);
    expect(flightRise("jetpack")).toBeGreaterThan(flightRise("propeller"));
  });

  test("you steer freely while flying", () => {
    const state = play(withSteer(stepHop(withItem("propeller"), FRAME), 1), 0.5);
    expect(state.flight).not.toBeNull();
    expect(state.vx).toBe(HOP.maxSpeed);
  });

  test("flying, you pass other boosts and springs, and can't stack or stretch a flight", () => {
    const more = [
      { y: 300, item: { kind: "jetpack" as const, offset: 0 } },
      { y: 600, spring: { offset: 0, firedAt: null } },
      { y: 900, kind: "breakable" as const },
    ];
    let state = stepHop(withItem("propeller", more), FRAME);
    const flight = state.flight;
    const passed = new Set<number>();
    state = play(state, 2, FRAME, (s) => {
      expect(s.flight).toEqual(flight);
      expect(s.springAt).toBeNull();
      expect(s.effects.filter((e) => e.kind !== "pickup")).toEqual([]);
      for (const p of s.platforms) if (p.y < s.y) passed.add(p.y);
      expect(s.platforms.find((p) => p.y === 300)?.item?.kind ?? "jetpack").toBe("jetpack");
    });
    expect(state.y).toBeGreaterThan(1000);
    expect([...passed]).toEqual(expect.arrayContaining([300, 600, 900]));
  });

  test("a flight's time is run time: a pause holds it", () => {
    const flying = stepHop(withItem("propeller"), FRAME);
    // A pause is no steps; picking up after it, the flight has as long left as before.
    const resumed = play(flying, HOP.propeller.seconds - 0.1);
    expect(resumed.flight).not.toBeNull();
    expect(play(resumed, 0.2).flight).toBeNull();
  });
});

describe("the pace", () => {
  // The first Hop's numbers, before it was calmed down.
  const FIRST = { gravity: 1800, jumpSpeed: 880, maxSpeed: 360, accel: 2800, reverse: 5200 };

  test("a little calmer than the first Hop: every bounce takes longer, by the same share", () => {
    expect(HOP_PACE).toBeGreaterThanOrEqual(0.85);
    expect(HOP_PACE).toBeLessThan(0.9);
    const airtime = landingTime(0)!;
    expect(airtime).toBeCloseTo((2 * FIRST.jumpSpeed) / FIRST.gravity / HOP_PACE);
    expect(landingTime(0, HOP.springSpeed)!).toBeCloseTo(airtime * Math.sqrt(HOP.springHeight));
  });

  test("the same heights and sideways reach as before, so the route is just as fair", () => {
    expect(JUMP_RISE).toBeCloseTo((FIRST.jumpSpeed * FIRST.jumpSpeed) / (2 * FIRST.gravity));
    expect(SPRING_RISE).toBeCloseTo(JUMP_RISE * HOP.springHeight);
    // Distance steered in a stretched time is the distance the first Hop steered.
    const firstReach = (t: number) => {
      const v = FIRST.maxSpeed;
      const reverse = FIRST.reverse;
      const turn = v / reverse;
      const back = (v * v) / (2 * reverse);
      if (t <= turn) return -(v * t - 0.5 * reverse * t * t);
      const u = t - turn;
      const speedUp = v / FIRST.accel;
      const ahead = u <= speedUp ? 0.5 * FIRST.accel * u * u : (v * v) / (2 * FIRST.accel) + v * (u - speedUp);
      return ahead - back;
    };
    for (const t of [0.05, 0.3, 0.6, 0.9]) expect(sideReach(t / HOP_PACE)).toBeCloseTo(firstReach(t), 6);
    // A flight climbs as far as it did.
    expect(HOP.propeller.speed * HOP.propeller.seconds).toBeCloseTo(640 * 2.5);
    expect(HOP.jetpack.speed * HOP.jetpack.seconds).toBeCloseTo(1150 * 3.5);
  });
});

describe("steering", () => {
  test("full speed the very next step you hold a way, turning round included, and a short glide when let go", () => {
    expect(steerSpeed(0, 1, FRAME)).toBe(HOP.maxSpeed);
    expect(steerSpeed(0, -1, FRAME)).toBe(-HOP.maxSpeed);
    // Reversing: no slide the wrong way first.
    expect(steerSpeed(HOP.maxSpeed, -1, FRAME)).toBe(-HOP.maxSpeed);
    expect(steerSpeed(-HOP.maxSpeed, 1, FRAME)).toBe(HOP.maxSpeed);
    let vx = HOP.maxSpeed;
    let glide = 0;
    let slid = 0;
    while (vx > 0) {
      vx = steerSpeed(vx, 0, FRAME);
      slid += vx * FRAME;
      glide += FRAME;
    }
    // Crisp, not icy: stopped in about a tenth of a second, having slid a third of a platform.
    expect(glide).toBeLessThan(0.15 / HOP_PACE);
    expect(slid).toBeGreaterThan(8);
    expect(slid).toBeLessThan(HOP.platform.width / 2);
  });

  test("one tap moves you that way on the very next step, by a step at full speed", () => {
    const still = bare([], { y: 500, vy: 0, camera: 0, x: W / 2, vx: 0 });
    for (const steer of [-1, 1] as const) {
      const next = stepHop(withSteer(still, steer), FRAME);
      expect(next.x - still.x).toBeCloseTo(steer * HOP.maxSpeed * FRAME);
      // And going the other way, it turns round in that same step.
      const turned = stepHop(withSteer({ ...still, vx: -steer * HOP.maxSpeed }, steer), FRAME);
      expect(turned.x - still.x).toBeCloseTo(steer * HOP.maxSpeed * FRAME);
    }
  });

  test("keys and touch hold the same steering, which never changes how fast you can go", () => {
    expect(withSteer(newHop(W, H, 1), -1).steer).toBe(-1);
    const state = newHop(W, H, 1);
    expect(withSteer(state, 0)).toBe(state);
    expect(steerSpeed(HOP.maxSpeed, 1, 1)).toBe(HOP.maxSpeed);
    expect(steerSpeed(-HOP.maxSpeed, -1, 1)).toBe(-HOP.maxSpeed);
  });

  test("facing follows the steering", () => {
    const left = stepHop(withSteer(bare([], { y: 500, vy: 0, camera: 0 }), -1), FRAME);
    expect(left.facing).toBe(-1);
    expect(stepHop(withSteer(left, 0), FRAME).facing).toBe(-1);
  });

  test("the reach the route plans on is never more than steering really gets", () => {
    for (let t = 0.05; t <= 1.2; t += 0.05) {
      let vx = -HOP.maxSpeed;
      let x = 0;
      for (let s = 0; s < t - 1e-9; s += FRAME) {
        const dt = Math.min(FRAME, t - s);
        vx = steerSpeed(vx, 1, dt);
        x += vx * dt;
      }
      expect(x).toBeGreaterThanOrEqual(sideReach(t) - 0.5);
    }
  });
});

describe("every gap can be made", () => {
  test.each([30, 80, 120, 150, 170, MAX_ROUTE_GAP])("the furthest trip the route allows %d up, from the worst start, lands", (dy) => {
    const reach = routeReach(dy);
    expect(reach).toBeGreaterThan(0);
    const from = 80;
    // On the far edge of the platform, already going full speed the wrong way.
    const state = bare([{ y: 0, x: from }, { y: dy, x: from + Math.min(reach, W / 2) }], {
      x: from - HALF_OVERLAP + 0.5,
      y: 0,
      vy: HOP.jumpSpeed,
      vx: -HOP.maxSpeed,
      steer: 1,
    });
    // Holding toward it, then letting go once over it: instant steering would carry you past a near one.
    const target = state.platforms[1].x;
    let landed = false;
    let current = state;
    for (let t = 0; t < 1.2 && !landed; t += FRAME) {
      const ahead = target - current.x;
      current = stepHop(withSteer(current, ahead > PW_HALF_TARGET ? 1 : ahead < -PW_HALF_TARGET ? -1 : 0), FRAME);
      if (current.platforms[1].landedAt !== null) landed = true;
    }
    expect(landed).toBe(true);
  });

  test("a gap taller than a bounce can reach is never part of the route", () => {
    expect(routeReach(MAX_ROUTE_GAP + 1)).toBe(-Infinity);
    expect(landingTime(JUMP_RISE + 1)).toBeNull();
    expect(worstTrip(0, 0, 100, 0, W)).toBe(100);
    expect(worstTrip(0, 150, 100, 150, W)).toBe(W / 2);
  });

  const steps = (state: HopState) => {
    const route = state.platforms.filter((p) => p.route).sort((a, b) => a.y - b.y || a.id - b.id);
    const byY: HopPlatform[][] = [];
    for (const platform of route) {
      const last = byY.at(-1);
      if (last && last[0].y === platform.y) last.push(platform);
      else byY.push([platform]);
    }
    return byY;
  };
  const centre = (p: HopPlatform) => p.track?.centre ?? p.x;
  const spread = (p: HopPlatform) => p.track?.range ?? 0;

  test.each(HEIGHTS)("on a board %d tall, from every route platform the next is in reach, in 40 climbs to 7,000 points", (height) => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = layRoute(W, height, seed, 7000 * HOP.unitsPerPoint);
      const route = steps(state);
      expect(route.length).toBeGreaterThan(50);
      for (let k = 1; k < route.length; k++) {
        const dy = route[k][0].y - route[k - 1][0].y;
        expect(dy).toBeLessThanOrEqual(MAX_ROUTE_GAP);
        for (const from of route[k - 1]) {
          const reachable = route[k].some(
            (to) => worstTrip(centre(from), spread(from), centre(to), spread(to), W) <= routeReach(dy) + 1e-9
          );
          expect(reachable, `seed ${seed}, step ${k}`).toBe(true);
        }
      }
      // Never a breakable on the route, and a breakable or a bouncy decoy never stands in for one.
      expect(state.platforms.filter((p) => p.route && p.kind === "breakable")).toEqual([]);
      expect(state.platforms.filter((p) => !p.route && p.kind !== "breakable" && p.kind !== "oneBounce")).toEqual([]);
    }
  });

  test("a one-bounce decoy you bounce off by accident still reaches the route above it", () => {
    let checked = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const state = layRoute(W, H, seed, 7000 * HOP.unitsPerPoint);
      const route = steps(state);
      for (const decoy of state.platforms.filter((p) => !p.route && p.kind === "oneBounce")) {
        const next = route.find((step) => step[0].y > decoy.y);
        if (!next) continue;
        checked++;
        const dy = next[0].y - decoy.y;
        expect(next.some((to) => worstTrip(decoy.x, 0, centre(to), spread(to), W) <= routeReach(dy) + 1e-9)).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  test("after a spring or a boost there are platforms both sides of the board to come down on", () => {
    let corridors = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const height of HEIGHTS) {
        const state = layRoute(W, height, seed, 9000 * HOP.unitsPerPoint);
        const route = steps(state);
        for (const platform of state.platforms) {
          const apex = platform.spring
            ? platform.y + HOP.spring.height + SPRING_RISE
            : platform.item
              ? platform.y + flightRise(platform.item.kind)
              : null;
          if (apex === null || apex > state.gen.y - 200) continue;
          corridors++;
          // Some way below the top, but not so far that you've fallen off the board.
          const below = route.filter((step) => step[0].y <= apex - 100 && step[0].y >= apex - Math.min(CORRIDOR_DEPTH, height * HOP.cameraShare));
          expect(below.length, `seed ${seed}`).toBeGreaterThan(0);
          for (const step of below) {
            expect(step).toHaveLength(2);
            expect(seamDistance(step[0].x, step[1].x, W)).toBeCloseTo(W / 2);
            expect(step.every((p) => p.kind === "normal" && !p.item && !p.spring)).toBe(true);
          }
        }
      }
    }
    expect(corridors).toBeGreaterThan(100);
  });

  test("from a corridor's twins, wherever you landed, the next platform is in reach", () => {
    // Corridor gaps stay low enough that a jump reaches anywhere on the board.
    expect(routeReach(135)).toBeGreaterThanOrEqual(W / 2);
  });
});

describe("difficulty", () => {
  test("climbs steadily, bringing each platform in at its height, and stops at its peak", () => {
    const at = (points: number) => hopDifficulty(points);
    expect(at(HOP_LEVELS.moving - 1).moving).toBe(0);
    expect(at(HOP_LEVELS.moving).moving).toBeGreaterThan(0);
    expect(at(HOP_LEVELS.breakable - 1).breakable).toBe(0);
    expect(at(HOP_LEVELS.breakable).breakable).toBeGreaterThan(0);
    expect(at(HOP_LEVELS.oneBounce - 1).oneBounce).toBe(0);
    expect(at(HOP_LEVELS.oneBounce).oneBounce).toBeGreaterThan(0);
    expect(at(HOP_LEVELS.jetpack - 1).jetpack).toBe(0);
    expect(at(HOP_LEVELS.jetpack).jetpack).toBeGreaterThan(0);
    expect(at(0).spring).toBeGreaterThan(at(HOP_LEVELS.peak).spring);
    for (let points = 0; points < HOP_LEVELS.peak; points += 250) {
      expect(at(points + 250).gapMax).toBeGreaterThanOrEqual(at(points).gapMax);
      expect(at(points + 250).gapMin).toBeGreaterThanOrEqual(at(points).gapMin);
    }
    expect(at(HOP_LEVELS.peak * 10)).toEqual(at(HOP_LEVELS.peak));
    expect(HOP_LEVELS.peak).toBeGreaterThanOrEqual(4000);
    expect(HOP_LEVELS.peak).toBeLessThanOrEqual(5000);
  });

  test("the opening is mostly normal platforms with generous gaps", () => {
    const state = layRoute(W, H, 3, 300 * HOP.unitsPerPoint);
    const opening = state.platforms.filter((p) => p.y < 290 * HOP.unitsPerPoint);
    expect(opening.every((p) => p.kind === "normal")).toBe(true);
    const ys = [...new Set(opening.map((p) => p.y))].sort((a, b) => a - b);
    const gaps = ys.slice(1).map((y, i) => y - ys[i]);
    expect(Math.max(...gaps)).toBeLessThan(JUMP_RISE * 0.5);
  });
});

const botRun = (height: number, seed: number, until: number, each?: (s: HopState, before: HopState) => void) => {
  let state = newHop(W, height, seed);
  for (let i = 0; i < 60 * 600 && !state.over && state.score < until; i++) {
    const before = withSteer(state, autoSteer(state));
    state = stepHop(before, FRAME);
    each?.(state, before);
  }
  return state;
};

describe("a whole climb", () => {
  test.each(HEIGHTS)("a careful player on a board %d tall gets past peak difficulty", (height) => {
    for (const seed of [11, 12, 13, 14]) {
      const state = botRun(height, seed, HOP_LEVELS.peak + 500);
      expect(state.score, `seed ${seed}`).toBeGreaterThanOrEqual(HOP_LEVELS.peak + 500);
    }
  });

  test("storage, effects and corridors stay bounded however long the climb", () => {
    let most = { platforms: 0, effects: 0, corridors: 0 };
    botRun(H, 21, 8000, (s) => {
      most = {
        platforms: Math.max(most.platforms, s.platforms.length),
        effects: Math.max(most.effects, s.effects.length),
        corridors: Math.max(most.corridors, s.corridors.length),
      };
      expect(s.platforms.every((p) => p.y >= s.camera - HOP.behind)).toBe(true);
    });
    expect(most.platforms).toBeLessThan(80);
    expect(most.effects).toBeLessThanOrEqual(HOP.maxEffects);
    expect(most.corridors).toBeLessThanOrEqual(4);
  });

  test("the score only goes up, from the highest you've been, and the camera never goes back down while you play", () => {
    botRun(H, 5, 3000, (s, before) => {
      expect(s.score).toBeGreaterThanOrEqual(before.score);
      expect(s.score).toBe(hopScore(s.top));
      expect(s.top).toBeGreaterThanOrEqual(s.y);
      if (!s.dying) expect(s.camera).toBeGreaterThanOrEqual(before.camera);
    });
  });

  test("bouncing on one platform or hanging at one height earns nothing", () => {
    const state = play(bare([{ y: 0 }], { y: 0, vy: HOP.jumpSpeed }), 5);
    expect(state.score).toBe(hopScore(JUMP_RISE));
  });

  test("a step never changes the state it was given", () => {
    let state = newHop(W, H, 31);
    for (let i = 0; i < 60 * 40 && !state.over; i++) {
      const before = withSteer(state, autoSteer(state));
      const frozen = structuredClone(before);
      state = stepHop(before, FRAME);
      expect(before).toEqual(frozen);
    }
  });

  test("the same seed and the same steering play out the same way", () => {
    const a = botRun(H, 99, 1500);
    const b = botRun(H, 99, 1500);
    expect(b).toEqual(a);
    expect(newHop(W, H, 99)).toEqual(newHop(W, H, 99));
    expect(newHop(W, H, 100).platforms).not.toEqual(newHop(W, H, 99).platforms);
  });

  test("the same time at a different frame rate ends up in the same place, to within a few units", () => {
    const script = (t: number): -1 | 0 | 1 => (t < 0.4 ? 1 : t < 0.9 ? 0 : -1);
    const at = (dt: number) => {
      let state = bare([{ y: 0, x: W / 2 }, { y: 0, x: W / 2 + 120 }], { y: 0, vy: HOP.jumpSpeed, x: W / 2 });
      for (let t = 0; t < 1.5 - 1e-9; t += dt) state = stepHop(withSteer(state, script(t)), dt);
      return state;
    };
    const sixty = at(1 / 60);
    for (const dt of [1 / 120, 1 / 144, 1 / 90]) {
      const other = at(dt);
      // Steering is stepped, not solved, so it drifts a little with the frame rate; the fall is exact.
      expect(Math.abs(other.x - sixty.x)).toBeLessThan(6);
      expect(Math.abs(other.y - sixty.y)).toBeLessThan(2);
      expect(other.score).toBeGreaterThanOrEqual(sixty.score - 1);
      expect(other.score).toBeLessThanOrEqual(sixty.score + 1);
    }
  });
});

describe("falling off", () => {
  test("taking the floor away (for test builds' own runs) ends the run", () => {
    const climbed = botRun(H, 2, 300);
    expect(climbed.score).toBeGreaterThanOrEqual(300);
    let state = dropFloor(climbed);
    expect(state.platforms).toEqual([]);
    for (let i = 0; i < 600 && !state.over; i++) state = stepHop(state, FRAME);
    expect(state.over).toBe(true);
    // Whatever was left of the bounce you were on, and no more.
    expect(state.score).toBeGreaterThanOrEqual(climbed.score);
    expect(state.score).toBeLessThanOrEqual(climbed.score + Math.ceil(JUMP_RISE / HOP.unitsPerPoint));
    expect(autoSteer(state)).toBe(0);
  });

  test("below the board you tumble for a moment, the camera following you down, then it's over once", () => {
    let state = bare([], { y: 0, vy: 0 });
    let overs = 0;
    let dyingSince: number | null = null;
    state = play(state, 3, FRAME, (s, before) => {
      if (s.over && !before.over) overs++;
      if (s.dying && !before.dying) dyingSince = s.time;
    });
    expect(overs).toBe(1);
    expect(dyingSince).not.toBeNull();
    expect(state.time - (dyingSince ?? 0)).toBeCloseTo(HOP.dyingSeconds, 1);
    expect(state.camera).toBeLessThan(newHop(W, H, 1).camera);
    expect(stepHop(state, FRAME)).toBe(state);
  });

  test("while falling off you don't land, collect anything or score", () => {
    const dying = { at: 0, camera: 0 };
    const start = bare([{ y: -80 }, { y: -60, item: { kind: "propeller", offset: 0 } }], { y: -70, vy: -100, dying, camera: 0, score: 7, top: 14 });
    const state = play(start, 0.4);
    expect(state.landedAt).toBe(start.landedAt);
    expect(state.flight).toBeNull();
    expect(state.score).toBe(7);
    expect(state.platforms[1].item).toBeDefined();
  });
});

describe("your best", () => {
  test("the line stays where your best was; passing it is noted once", () => {
    let state = bare([{ y: 0 }], { y: 0, vy: HOP.jumpSpeed, best: 50 });
    const times: (number | null)[] = [];
    state = play(state, 3, FRAME, (s) => times.push(s.bestAt));
    expect(state.best).toBe(50);
    const first = times.find((t) => t !== null);
    expect(first).toBeDefined();
    expect(new Set(times.filter((t) => t !== null))).toEqual(new Set([first]));
  });

  test("no line without a best", () => {
    const state = play(bare([{ y: 0 }], { y: 0, vy: HOP.jumpSpeed }), 1);
    expect(state.bestAt).toBeNull();
  });
});

describe("scores the leaderboard takes", () => {
  const limit = SCORE_LIMITS[CURRENT_GAME_VERSION.hop].hop;

  test("nothing climbs faster than the per-second limit allows", () => {
    const fastest = Math.max(HOP.springSpeed, HOP.jetpack.speed, HOP.propeller.speed, HOP.jumpSpeed) / HOP.unitsPerPoint;
    expect(Math.ceil(fastest)).toBe(575);
    expect(fastest).toBeLessThan(limit.perSecond);
    expect(fastest * 6 * 60 * 60).toBeLessThan(limit.max);
  });

  test("a run's score is always one the server takes", () => {
    const run = botRun(H, 8, 2500);
    const queued = (score: number, seconds: number) => ({
      runId: "hop-run-0001",
      game: "hop" as const,
      version: CURRENT_GAME_VERSION.hop,
      score,
      durationMs: seconds * 1000,
      playedAt: Date.now(),
    });
    expect(scoreProblem(queued(run.score, run.time), Date.now())).toBeNull();
    // A spring straight up, the fastest climb there is.
    let state = bare([{ y: 0, spring: { offset: 0, firedAt: null } }], { y: HOP.spring.height + 2, vy: -1 });
    state = play(state, 0.6, FRAME, (s) => {
      expect(s.score).toBeLessThanOrEqual(limit.perSecond * s.time);
    });
    expect(state.score).toBeGreaterThan(200);
  });

  test("scoring stops at the cap", () => {
    expect(HOP_MAX_SCORE).toBe(limit.max);
    expect(hopScore(1e12)).toBe(HOP_MAX_SCORE);
    expect(hopScore(-50)).toBe(0);
  });

  test("a practice run from higher up starts with that score", () => {
    const state = hopAt(W, H, 4, 2000);
    expect(state.score).toBe(2000);
    expect(state.y).toBe(2000 * HOP.unitsPerPoint);
    expect(state.platforms.length).toBeGreaterThan(5);
  });
});

describe("the page", () => {
  // Greys, each stage its own, written out without a colour literal.
  const grey = (level: number) => `#${level.toString(16).padStart(2, "0").repeat(3)}`;
  const swatch = (hex: string) => ({ paper: hex, grid: hex, margin: hex, ink: hex, mark: hex, sketch: hex });
  const palette: HopPalette = { morning: swatch(grey(240)), clouds: swatch(grey(200)), dusk: swatch(grey(160)), night: swatch(grey(30)) };

  test("washes from morning through clouds and dusk to a night that stays", () => {
    expect(stageWeights(0).morning).toBe(1);
    expect(stageWeights(1300).clouds).toBe(1);
    expect(stageWeights(2300).dusk).toBe(1);
    expect(stageWeights(3000).night).toBe(1);
    expect(stageWeights(250_000).night).toBe(1);
    for (let points = 0; points < 3200; points += 37) {
      const weights = Object.values(stageWeights(points));
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    }
    expect(HOP_STAGES.every((stop, i) => i === 0 || stop.at > HOP_STAGES[i - 1].at)).toBe(true);
  });

  test("blends smoothly between stages, with no hard cut", () => {
    expect(hopPage(0, palette).paper).toBe(grey(240));
    expect(hopPage(5000, palette).paper).toBe(grey(30));
    expect(hopPage(5000, palette).dark).toBe(true);
    expect(hopPage(0, palette).dark).toBe(false);
    const between = hopPage(825, palette).paper;
    expect(between).not.toBe(grey(240));
    expect(between).not.toBe(grey(200));
  });
});

describe("the page rising", () => {
  const { grace, ramp, speed } = HOP.rise;
  /** Bouncing straight up and down on one platform, steering nowhere. */
  const idle = (height = H) => ({ ...bare([{ y: 0 }], { y: 0, vy: HOP.jumpSpeed }), height, camera: -height * 0.22 });
  /** Where the camera sits following a bounce from 0 and nothing else. */
  const followed = (height = H) => JUMP_RISE - height * HOP.cameraShare;

  test("waits out a few seconds of grace at the start of a run", () => {
    const state = play(idle(), grace - 0.05);
    expect(hopRise(state)).toBe(0);
    expect(hopCatching(state)).toBe(0);
    expect(state.camera).toBeCloseTo(followed(), 0);
  });

  test("then speeds up over a moment to a slow pace, and holds it", () => {
    const at = (t: number) => hopRise({ ...idle(), time: t });
    expect(at(grace + ramp / 2)).toBeCloseTo(speed[0] / 2);
    expect(at(grace + ramp)).toBeCloseTo(speed[0]);
    expect(at(grace + ramp * 5)).toBeCloseTo(speed[0]);
    expect(hopCatching({ ...idle(), time: grace + ramp / 2 })).toBeCloseTo(0.5);
    // A little faster higher up, to its top at peak difficulty.
    const high = (points: number) => hopRise({ ...idle(), time: 60, landed: points * HOP.unitsPerPoint });
    expect(high(HOP_LEVELS.peak / 2)).toBeGreaterThan(speed[0]);
    expect(high(HOP_LEVELS.peak)).toBeCloseTo(speed[1]);
    expect(high(HOP_LEVELS.peak * 3)).toBeCloseTo(speed[1]);
  });

  test.each(HEIGHTS)("bouncing in place on a board %d tall ends the run, and earns nothing for it", (height) => {
    let caught = 0;
    const state = play(idle(height), 40, FRAME, (s) => {
      if (!s.dying) caught = s.time;
      expect(s.score).toBeLessThanOrEqual(hopScore(JUMP_RISE));
    });
    expect(state.score).toBe(hopScore(JUMP_RISE));
    expect(state.over).toBe(true);
    // Not straight away: well after the grace.
    expect(caught).toBeGreaterThan(grace + ramp + 2);
    expect(caught).toBeLessThan(25);
  });

  test("landing higher than you have before starts the grace again; landing back down doesn't", () => {
    let state = bare([{ y: 0 }, { y: 120, x: W / 2 }], { y: 0, vy: HOP.jumpSpeed, time: 10, riseAt: 0 });
    state = play(state, 1.2);
    expect(state.landed).toBe(120);
    expect(hopRise(state)).toBe(0);
    const higher = state.riseAt;
    expect(higher).toBeGreaterThan(10);
    // Dropping back to a lower one keeps the clock where it was.
    const back = play(bare([{ y: 0 }], { y: 40, vy: -100, time: 10, riseAt: 2, landed: 120 }), 0.2);
    expect(back.landedAt).not.toBeNull();
    expect(back.riseAt).toBe(2);
    expect(back.landed).toBe(120);
  });

  test("a breakable you fall through isn't a landing", () => {
    const state = play(bare([{ y: 0, kind: "breakable" }], { y: 10, vy: -100, time: 10, riseAt: 2, landed: -100 }), 0.1);
    expect(state.riseAt).toBe(2);
    expect(state.landed).toBe(-100);
  });

  test("never moves during a boost's flight, and gives a fresh grace after it", () => {
    const start = bare([], { y: 0, vy: 0, time: 30, riseAt: 0, flight: { kind: "propeller", at: 30 } });
    const end = play(start, HOP.propeller.seconds + 0.5, FRAME, (s, before) => {
      if (s.flight) {
        expect(hopRise(s)).toBe(0);
        // Only following you up.
        expect(s.camera).toBeCloseTo(Math.max(before.camera, s.y - H * HOP.cameraShare), 6);
      }
    });
    expect(end.flight).toBeNull();
    expect(hopRise(end)).toBe(0);
    expect(end.time - end.riseAt).toBeLessThan(grace);
  });

  test("capped under the slowest pace the route climbs at, and climbing lands you higher inside the grace", () => {
    // The smallest gap, made at the end of a whole bounce, is the slowest the route goes up.
    const slowest = HOP_DIFFICULTY.gapMin[0] / landingTime(HOP_DIFFICULTY.gapMin[0])!;
    expect(Math.max(...speed)).toBeLessThan(slowest);
    // The longest a route step can take is a whole bounce back to the same height.
    expect(landingTime(0)!).toBeLessThan(grace / 2);
  });

  test.each(HEIGHTS)("every route step on a board %d tall is reached inside the grace, so the page never moves for a climber", (height) => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const state = layRoute(W, height, seed, (HOP_LEVELS.peak + 500) * HOP.unitsPerPoint);
      const tops = [...new Set(state.platforms.filter((p) => p.route).map((p) => p.y))].sort((a, b) => a - b);
      for (let i = 1; i < tops.length; i++) {
        const t = landingTime(tops[i] - tops[i - 1]);
        expect(t, `seed ${seed} step ${i}`).not.toBeNull();
        expect(t!).toBeLessThan(grace);
      }
    }
  });

  test("a careful climber barely feels it: the page rises on its own a sliver of the time", () => {
    let rising = 0;
    let steps = 0;
    const state = botRun(H, 17, 3000, (_, before) => {
      steps++;
      if (hopRise(before) > 0) rising++;
    });
    expect(state.score).toBeGreaterThanOrEqual(3000);
    expect(rising / steps).toBeLessThan(0.05);
  });

  test("rises the same way at any frame rate, to within a unit", () => {
    const at = (dt: number) => play(idle(), grace + ramp + 3, dt).camera;
    const sixty = at(1 / 60);
    expect(sixty).toBeGreaterThan(followed() + speed[0] * 2);
    for (const dt of [1 / 30, 1 / 120, 1 / 144]) expect(Math.abs(at(dt) - sixty)).toBeLessThan(1);
  });

  test("the rising preview is catching up, its bottom just under your platform", () => {
    const state = previewHop("rising", W, H);
    expect(hopCatching(state)).toBeGreaterThan(0.5);
    expect(state.camera).toBeLessThan(state.base);
    expect(state.camera).toBeGreaterThan(state.base - 60);
  });
});

describe("previews", () => {
  test.each(HOP_PREVIEWS)("%s is a still moment that's still a valid run", (name) => {
    expect(isHopPreview(name)).toBe(true);
    const state = previewHop(name, W, H);
    expect(state.over).toBe(false);
    expect(state.dying).toBeNull();
    expect(state.platforms.length).toBeGreaterThan(3);
  });

  test("the flying ones are flying, and the best ones have a best", () => {
    expect(previewHop("propeller", W, H).flight?.kind).toBe("propeller");
    expect(previewHop("propeller", W, H).facing).toBe(1);
    expect(previewHop("propellerleft", W, H).flight?.kind).toBe("propeller");
    expect(previewHop("propellerleft", W, H).facing).toBe(-1);
    expect(previewHop("jetpack", W, H).flight?.kind).toBe("jetpack");
    expect(previewHop("best", W, H).bestAt).toBeNull();
    expect(previewHop("best", W, H).best).toBeGreaterThan(0);
    expect(previewHop("crossed", W, H).bestAt).not.toBeNull();
    expect(isHopPreview("dive")).toBe(false);
  });
});
