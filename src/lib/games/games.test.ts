import { describe, expect, test } from "vitest";
import {
  birdX,
  FLAPPY,
  flap,
  gapHeight,
  MAX_GAP_DROP,
  MAX_GAP_RISE,
  newFlappy,
  pipeSpeed,
  stepFlappy,
  type FlappyState,
} from "./flappy";
import { cardFitScale, fitBoard, fitScale, groundLine } from "./fit";
import { atSwipeEdge, needsLeaveConfirm, SWIPE_EDGE } from "./leave";
import { between, random } from "./random";
import {
  apex,
  clearableLength,
  duck,
  HIT_WIDTH,
  hop,
  isPatternKind,
  jump,
  makePattern,
  minimumGap,
  comboGap,
  COMBO_FROM_SECONDS,
  HARD_FROM_SECONDS,
  longestCombo,
  MAX_COMBO,
  type PatternKind,
  newRunner,
  onGround,
  patternSpan,
  previewWith,
  REACH_SHARE,
  RUNNER,
  runnerHeight,
  runnerSpeed,
  sliding,
  stepRunner,
  type RunnerState,
} from "./runner";
import { moveShooter, newShooter, SHOOTER, spawnInterval, stepShooter, type ShooterState } from "./shooter";

const FRAME = 1 / 60;

const runFor = <S extends { over: boolean }>(state: S, seconds: number, step: (s: S, dt: number) => S, act?: (s: S) => S) => {
  let current = state;
  for (let t = 0; t < seconds && !current.over; t += FRAME) {
    current = step(act ? act(current) : current, FRAME);
  }
  return current;
};

describe("random", () => {
  test("is repeatable from a seed and stays in range", () => {
    const a = { seed: 42 };
    const b = { seed: 42 };
    const draws = Array.from({ length: 50 }, () => random(a));
    expect(Array.from({ length: 50 }, () => random(b))).toEqual(draws);
    expect(draws.every((n) => n >= 0 && n < 1)).toBe(true);
    const ranged = between({ seed: 7 }, 10, 20);
    expect(ranged).toBeGreaterThanOrEqual(10);
    expect(ranged).toBeLessThan(20);
  });
});

describe("shooter", () => {
  const quiet = (state: ShooterState): ShooterState => ({ ...state, spawnIn: 1e9 });

  test("the score rises the longer you survive, and the plane fires on its own", () => {
    const state = runFor(quiet(newShooter(360, 640, 1)), 3, stepShooter);
    expect(state.over).toBe(false);
    expect(state.score).toBe(Math.floor(state.time * SHOOTER.pointsPerSecond));
    expect(state.score).toBeGreaterThanOrEqual(29);
    expect(state.shots.length).toBeGreaterThan(0);
    expect(state.shots.every((shot) => shot.vy < 0)).toBe(true);
  });

  test("shooting an enemy down scores its points", () => {
    let state = quiet(newShooter(360, 640, 1));
    state = {
      ...state,
      enemies: [{ id: 999, kind: "small", x: state.player.x, y: 300, vx: 0, vy: 0, hp: 1, fireIn: 99 }],
    };
    state = runFor(state, 1, stepShooter);
    expect(state.kills).toBe(1);
    expect(state.score).toBe(Math.floor(state.time * SHOOTER.pointsPerSecond) + SHOOTER.smallPoints);
  });

  test("an enemy bullet on the plane ends the run, and nothing moves after", () => {
    let state = quiet(newShooter(360, 640, 1));
    const { x, y } = state.player;
    state = { ...state, bullets: [{ id: 999, x, y: y - 40, vx: 0, vy: 200 }] };
    state = runFor(state, 1, stepShooter);
    expect(state.over).toBe(true);
    expect(stepShooter(state, FRAME)).toBe(state);
    expect(moveShooter(state, 10, 10)).toBe(state);
  });

  test("enemies come in from outside the edges, faster as time goes on", () => {
    expect(spawnInterval(0)).toBeGreaterThan(spawnInterval(60));
    expect(spawnInterval(70)).toBe(0.3);
    expect(spawnInterval(1000)).toBeLessThan(0.3);
    expect(spawnInterval(1000)).toBeGreaterThan(SHOOTER.spawnFloor);
    let state = newShooter(360, 640, 3);
    const seen: { x: number; y: number }[] = [];
    for (let i = 0; i < 600; i++) {
      const known = new Set(state.enemies.map((enemy) => enemy.id));
      state = stepShooter({ ...state, bullets: [] }, FRAME);
      for (const enemy of state.enemies) if (!known.has(enemy.id)) seen.push(enemy);
    }
    expect(seen.length).toBeGreaterThan(5);
    expect(seen.every((e) => e.x < 0 || e.x > 360 || e.y < 0)).toBe(true);
  });

  test("dragging moves the plane but keeps it on the board", () => {
    const state = newShooter(360, 640, 1);
    expect(moveShooter(state, -1000, -1000).player).toEqual({ x: SHOOTER.planeSize / 2, y: 640 * 0.3 });
    expect(moveShooter(state, 1000, 1000).player).toEqual({ x: 360 - SHOOTER.planeSize / 2, y: 640 - SHOOTER.planeSize / 2 });
  });
});

describe("runner", () => {
  const blank = (seed = 1, time = 0): RunnerState => ({ ...newRunner(760, seed), time, speed: runnerSpeed(time), nextIn: 1e9 });
  const place = (state: RunnerState, kind: Parameters<typeof makePattern>[1], x = 260): RunnerState => {
    const copy = { ...state };
    const obstacles = makePattern(copy, kind, x);
    return { ...copy, obstacles };
  };
  const firstFront = (s: RunnerState) => Math.min(...s.obstacles.map((o) => o.x));

  test("speeds up over time, up to a top speed, and scores the distance", () => {
    expect(runnerSpeed(0)).toBe(RUNNER.startSpeed);
    expect(runnerSpeed(10)).toBeGreaterThan(RUNNER.startSpeed);
    expect(runnerSpeed(1000)).toBeGreaterThan(RUNNER.topSpeed);
    expect(runnerSpeed(1e6)).toBeLessThanOrEqual(RUNNER.ceilingSpeed);
    const state = runFor(blank(), 2, stepRunner);
    expect(state.score).toBe(Math.floor(state.distance / RUNNER.stride));
    expect(state.score).toBeGreaterThan(40);
  });

  test("a tap is a small hop, a swipe up the big jump", () => {
    expect(apex(RUNNER.hopSpeed)).toBeGreaterThan(60);
    expect(apex(RUNNER.hopSpeed)).toBeLessThan(apex(RUNNER.jumpSpeed) / 2);
    const peak = (start: RunnerState) => {
      let s = start;
      let top = 0;
      for (let i = 0; i < 120; i++) {
        s = stepRunner(s, FRAME);
        top = Math.max(top, s.y);
      }
      return top;
    };
    expect(Math.abs(peak(hop(blank())) - apex(RUNNER.hopSpeed))).toBeLessThan(1);
    expect(Math.abs(peak(jump(blank())) - apex(RUNNER.jumpSpeed))).toBeLessThan(1);
  });

  test("a swipe up just after the tap turns the hop into the big jump; later it doesn't", () => {
    const hopped = stepRunner(stepRunner(hop(blank()), FRAME), FRAME);
    const upgraded = jump(hopped);
    expect(upgraded.bigJump).toBe(true);
    const top = runFor(upgraded, 0.6, stepRunner, (x) => x);
    let peak = 0;
    for (let s = upgraded, i = 0; i < 60; i++) {
      s = stepRunner(s, FRAME);
      peak = Math.max(peak, s.y);
    }
    expect(top.over).toBe(false);
    expect(Math.abs(peak - apex(RUNNER.jumpSpeed))).toBeLessThan(1);
    const late = runFor(hop(blank()), RUNNER.upgradeSeconds + 0.05, stepRunner);
    expect(jump(late)).toBe(late);
    expect(hop(hopped)).toBe(hopped);
  });

  test("a small rock: a hop clears it, standing still doesn't", () => {
    const autopilot = (s: RunnerState) => (firstFront(s) - RUNNER.x < s.speed * 0.15 + 20 ? hop(s) : s);
    expect(runFor(place(blank(), "rock"), 2, stepRunner).over).toBe(true);
    expect(runFor(place(blank(), "rock"), 2, stepRunner, autopilot).over).toBe(false);
  });

  test("a tall rock needs the big jump: a hop hits it", () => {
    const at = (act: (s: RunnerState) => RunnerState) => (s: RunnerState) =>
      firstFront(s) - RUNNER.x < s.speed * 0.2 + 20 ? act(s) : s;
    expect(runFor(place(blank(1, 30), "tall"), 2, stepRunner, at(hop)).over).toBe(true);
    expect(runFor(place(blank(1, 30), "tall"), 2, stepRunner, at(jump)).over).toBe(false);
  });

  test("hanging vines can only be slid under: even the big jump hits them", () => {
    const at = (act: (s: RunnerState) => RunnerState) => (s: RunnerState) =>
      firstFront(s) - RUNNER.x < s.speed * 0.15 + 20 && !sliding(s) ? act(s) : s;
    expect(runFor(place(blank(1, 30), "hang"), 2, stepRunner, at(jump)).over).toBe(true);
    expect(runFor(place(blank(1, 30), "hang"), 2, stepRunner, at(duck)).over).toBe(false);
  });

  test("a swipe down in the same touch as the hop, before he leaves the ground, slides at once", () => {
    const pressed = hop(blank());
    const ducked = duck(pressed);
    expect(sliding(ducked)).toBe(true);
    expect(ducked.vy).toBe(0);
    const later = runFor(ducked, 0.1, stepRunner);
    expect(onGround(later)).toBe(true);
    expect(runnerHeight(later)).toBe(RUNNER.slideHeight);
  });

  test("can't jump again in the air; a swipe down there dives and slides on landing", () => {
    let state = runFor(jump(blank()), 0.2, stepRunner);
    expect(onGround(state)).toBe(false);
    expect(jump(state)).toBe(state);
    state = duck(state);
    expect(state.vy).toBeLessThanOrEqual(-RUNNER.diveSpeed);
    state = runFor(state, 0.2, stepRunner);
    expect(onGround(state)).toBe(true);
    expect(sliding(state)).toBe(true);
    expect(runnerHeight(state)).toBe(RUNNER.slideHeight);
  });

  test("every pattern fits its rules at every speed: hop ones in a hop's reach, big ones out of it but in the big jump's", () => {
    const H = RUNNER.forgive;
    for (const time of [0, 10, 25, 45, 80]) {
      for (let seed = 1; seed <= 40; seed++) {
        const state = blank(seed, time);
        for (const kind of ["rock", "tall", "wide", "double", "beam", "hang"] as const) {
          const group = makePattern(state, kind, 300);
          const span = patternSpan(group);
          const height = Math.max(...group.map((o) => o.bottom + o.height));
          const s = state.speed;
          if (kind === "rock") {
            expect(height - H).toBeLessThan(apex(RUNNER.hopSpeed));
            expect(span).toBeLessThanOrEqual(REACH_SHARE * clearableLength(RUNNER.hopSpeed, height, s));
          }
          if (kind === "tall") {
            expect(height - H).toBeGreaterThan(apex(RUNNER.hopSpeed));
            expect(span).toBeLessThanOrEqual(REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, s));
          }
          if (kind === "wide") {
            expect(span).toBeGreaterThan(clearableLength(RUNNER.hopSpeed, height, s));
            expect(span).toBeLessThanOrEqual(REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, s) + 1);
          }
          if (kind === "double") {
            expect(group).toHaveLength(2);
            expect(group[1].x - (group[0].x + group[0].width)).toBeLessThanOrEqual(24);
            expect(height - H).toBeGreaterThan(apex(RUNNER.hopSpeed));
            expect(span).toBeLessThanOrEqual(REACH_SHARE * clearableLength(RUNNER.jumpSpeed, height, s));
          }
          if (kind === "hang") {
            expect(group[0].bottom).toBeGreaterThan(RUNNER.slideHeight - H);
            expect(group[0].bottom).toBeLessThan(RUNNER.standHeight - H);
            expect(group[0].bottom + group[0].height).toBeGreaterThan(apex(RUNNER.jumpSpeed) + RUNNER.standHeight);
          }
        }
      }
    }
  });

  /**
   * Plays with the right input for each pattern, timed from the physics:
   * a hop or the big jump centred over the pattern, or a slide that covers it.
   * Any pattern the generator makes must be cleared this way.
   */
  const autopilot = (s: RunnerState, late = 0): RunnerState => {
    const xL = RUNNER.x - HIT_WIDTH / 2;
    const xR = RUNNER.x + HIT_WIDTH / 2;
    const ahead = s.obstacles.filter((o) => o.x + o.width > xL).sort((a, b) => a.x - b.x);
    if (ahead.length === 0) return s;
    const group = ahead.filter((o) => o.group === ahead[0].group);
    const front = Math.min(...group.map((o) => o.x));
    const back = Math.max(...group.map((o) => o.x + o.width));
    const enter = (front - xR) / s.speed;
    const exit = (back - xL) / s.speed;
    const pattern = group[0].pattern;
    if (pattern === "hang" || pattern === "beam" || pattern === "bar" || pattern === "twin") {
      if (!onGround(s)) return enter < 0.3 - late ? duck(s) : s;
      // Swipe down as it arrives, again if a slide under the last one won't last past it.
      return enter <= 0.08 - late && (!sliding(s) || s.slideFor < exit) ? duck(s) : s;
    }
    const speed = pattern === "rock" ? RUNNER.hopSpeed : RUNNER.jumpSpeed;
    const takeoff = (enter + exit) / 2 - speed / RUNNER.gravity;
    if (takeoff > FRAME / 2 - late || !onGround(s)) return s;
    return pattern === "rock" ? hop(s) : jump(s);
  };

  test("every generated sequence can be cleared with the right input, at every speed (seeded)", () => {
    const passed: Record<string, number> = {};
    for (const time of [0, 8, 20, 35, 50, 70, 90]) {
      for (let seed = 1; seed <= 40; seed++) {
        let state: RunnerState = { ...newRunner(760, seed), time, speed: runnerSpeed(time) };
        const seen = new Set<number>();
        for (let i = 0; i < 60 * 45 && !state.over; i++) {
          state = stepRunner(autopilot(state), FRAME);
          for (const o of state.obstacles) if (!seen.has(o.group)) {
            seen.add(o.group);
            passed[o.pattern] = (passed[o.pattern] ?? 0) + 1;
          }
        }
        expect(state.over, `seed ${seed} from ${time}s died at ${state.time.toFixed(1)}s`).toBe(false);
      }
    }
    // Every kind of pattern came up and was cleared.
    for (const kind of ["rock", "tall", "wide", "double", "beam", "hang"]) expect(passed[kind]).toBeGreaterThan(20);
  });

  test("combos start as pairs and grow the longer you last, up to a cap", () => {
    expect(longestCombo(COMBO_FROM_SECONDS - 1)).toBe(0);
    expect(longestCombo(COMBO_FROM_SECONDS)).toBe(2);
    expect(longestCombo(60)).toBeGreaterThan(longestCombo(30));
    expect(longestCombo(HARD_FROM_SECONDS - 1)).toBe(MAX_COMBO);
  });

  test("combos leave room for a human: a little early or a little late still clears them", () => {
    let combos = 0;
    let longest = 0;
    for (const late of [-0.05, 0.05]) {
      for (const time of [20, 45, 90, 150]) {
        for (let seed = 1; seed <= 30; seed++) {
          let state: RunnerState = { ...newRunner(760, seed), time, speed: runnerSpeed(time) };
          for (let i = 0; i < 60 * 40 && !state.over; i++) {
            if (state.chain.length > 0 && state.nextIn <= state.speed * FRAME) combos++;
            const before = state.chain.length;
            state = stepRunner(autopilot(state, late), FRAME);
            // A new combo just started: its first pattern is out, the rest queued.
            if (before === 0 && state.chain.length > 0) longest = Math.max(longest, state.chain.length + 1);
          }
          expect(state.over, `${late > 0 ? "late" : "early"}, seed ${seed} from ${time}s died at ${state.time.toFixed(1)}s`).toBe(false);
        }
      }
    }
    expect(combos).toBeGreaterThan(100);
    // Late in a run they reach the longest there is.
    expect(longest).toBeGreaterThanOrEqual(MAX_COMBO);
  });

  test("a preview board shows the asked-for patterns in order, sized for the given time", () => {
    const board = previewWith(760, ["double", "hang"], 30);
    expect(board.obstacles.map((o) => o.pattern)).toEqual(["double", "double", "hang"]);
    expect(board.obstacles[0].x).toBeCloseTo(760 * 0.4);
    expect(board.speed).toBe(runnerSpeed(30));
    expect(["rock", "hang", "snake"].map(isPatternKind)).toEqual([true, true, false]);
  });

  test("patterns are spaced to land the big jump and react, or, inside a combo, to land and go again", () => {
    let tight = 0;
    for (const time of [0, 20, 60, 90]) {
      for (let seed = 1; seed <= 10; seed++) {
        let state: RunnerState = { ...newRunner(760, seed), time, speed: runnerSpeed(time) };
        // Each pattern's front and back in distance run, the speed it came at,
        // and whether it was the next of a combo already under way.
        const spawned: { kind: string; front: number; back: number; speed: number; inCombo: boolean }[] = [];
        for (let i = 0; i < 60 * 30; i++) {
          const before = new Set(state.obstacles.map((o) => o.group));
          const inCombo = state.chain.length > 0;
          state = stepRunner(autopilot(state), FRAME);
          const fresh = state.obstacles.filter((o) => !before.has(o.group));
          if (fresh.length) {
            const front = state.distance + Math.min(...fresh.map((o) => o.x));
            spawned.push({ kind: fresh[0].pattern, front, back: state.distance + Math.max(...fresh.map((o) => o.x + o.width)), speed: state.speed, inCombo });
          }
        }
        for (let k = 1; k < spawned.length; k++) {
          const [before, after] = [spawned[k - 1], spawned[k]];
          const gap = after.front - before.back;
          if (!after.inCombo) {
            expect(gap).toBeGreaterThanOrEqual(minimumGap(before.speed) - 1);
            continue;
          }
          tight++;
          expect(gap).toBeGreaterThanOrEqual(comboGap(before.kind as PatternKind, after.kind as PatternKind, before.speed) - 1);
        }
      }
    }
    expect(tight).toBeGreaterThan(10);
  });
});

describe("flappy", () => {
  test("falls without flapping and the ground ends the run", () => {
    const state = runFor(newFlappy(360, 640, 1), 5, stepFlappy);
    expect(state.over).toBe(true);
    expect(state.y).toBe(640 - FLAPPY.groundHeight - FLAPPY.radius);
    expect(flap(state)).toBe(state);
  });

  test("a flap sends the bird up", () => {
    const state = stepFlappy(flap(newFlappy(360, 640, 1)), FRAME);
    expect(state.vy).toBeLessThan(0);
    expect(state.y).toBeLessThan(640 * 0.42);
  });

  test("the pipes speed up and the gaps narrow with the score, then keep on in levels without end", () => {
    expect(pipeSpeed(0)).toBe(150);
    expect(pipeSpeed(250)).toBeCloseTo(181.6, 1);
    expect(pipeSpeed(500)).toBeCloseTo(193.2, 1);
    expect(pipeSpeed(999)).toBeCloseTo(199.1, 1);
    expect(pipeSpeed(1000)).toBeCloseTo(202.2, 1);
    expect(pipeSpeed(10_000)).toBeCloseTo(215.6, 1);
    expect(pipeSpeed(1_000_000)).toBeGreaterThan(pipeSpeed(500_000));
    expect(gapHeight(0)).toBe(180);
    expect(gapHeight(250)).toBeCloseTo(161.0, 1);
    expect(gapHeight(500)).toBeCloseTo(154.1, 1);
    expect(gapHeight(999)).toBeCloseTo(150.6, 1);
    expect(gapHeight(10_000)).toBeCloseTo(133.3, 1);
    expect(gapHeight(1_000_000)).toBeLessThan(gapHeight(500_000));
    expect(gapHeight(1_000_000)).toBeGreaterThan(FLAPPY.floorGap);
  });

  test("each gap passed scores ten", () => {
    const autopilot = (s: FlappyState) => {
      const next = s.pipes.find((p) => p.x + FLAPPY.pipeWidth > birdX(s) - FLAPPY.radius);
      const target = next ? next.gapTop + next.gapHeight * 0.62 : s.height * 0.45;
      return s.y > target && s.vy > 0 ? flap(s) : s;
    };
    const state = runFor(newFlappy(360, 640, 5), 30, stepFlappy, autopilot);
    expect(state.over).toBe(false);
    expect(state.gaps).toBeGreaterThan(10);
    expect(state.score).toBe(state.gaps * FLAPPY.pointsPerGap + Math.floor(state.time));
  });

  test("at the first stage's top speed a flap fits in the narrowest gap, and the steepest runs of gaps can be flown", () => {
    const hitRadius = FLAPPY.radius - 2;
    const flapRise = FLAPPY.flapSpeed ** 2 / (2 * FLAPPY.gravity);
    expect(flapRise).toBeLessThan(FLAPPY.narrowestGap - 2 * hitRadius);

    // Gaps as far apart as they may be, with the score far past where the speed
    // levels off, flown by a player whose taps only land every 0.15 seconds.
    // Before 2.12.44 (240 a second, gaps of 130) the run of drops couldn't be.
    const gap = gapHeight(999);
    const runs = [
      [500, 500 - MAX_GAP_RISE, 500 - MAX_GAP_RISE + MAX_GAP_DROP, 500 + MAX_GAP_DROP - 2 * MAX_GAP_RISE],
      [300, 300 + MAX_GAP_DROP, 300 + MAX_GAP_DROP - MAX_GAP_RISE, 300 + 2 * MAX_GAP_DROP - MAX_GAP_RISE],
      [800, 800 - MAX_GAP_RISE, 800 - 2 * MAX_GAP_RISE, 800 - 3 * MAX_GAP_RISE],
      [60, 60 + MAX_GAP_DROP, 60 + 2 * MAX_GAP_DROP, 60 + 2 * MAX_GAP_DROP],
    ];
    const beat = (s: FlappyState) => {
      let next = s;
      for (let i = 0; i < 9 && !next.over; i++) next = stepFlappy(next, FRAME);
      return next;
    };
    const through = (s: FlappyState, goal: number): boolean =>
      !s.over && (s.gaps === goal || through(beat(s), goal) || through(beat(flap(s)), goal));
    for (const tops of runs) {
      const pipes = tops.map((gapTop, i) => ({ id: i + 1, x: 300 + i * FLAPPY.spacing, gapTop, gapHeight: gap, passed: false }));
      const state: FlappyState = { ...newFlappy(720, 1000, 1), gaps: 90, time: 99, y: tops[0] + gap / 2, nextIn: 1e9, pipes };
      expect(pipeSpeed(state.gaps * FLAPPY.pointsPerGap + state.time)).toBeGreaterThan(FLAPPY.topSpeed - 1);
      expect(through(state, 90 + tops.length)).toBe(true);
    }
  });

  test("a gap never sits higher than the bird can climb to from the one before", () => {
    // A tall board at the top speed is where an unbounded gap could be out of reach.
    for (const seed of [1, 2, 3, 4, 5]) {
      let state: FlappyState = { ...newFlappy(480, 820, seed), gaps: 99 };
      const tops: number[] = [];
      for (let i = 0; i < 30_000 && tops.length < 120; i++) {
        const known = new Set(state.pipes.map((p) => p.id));
        state = stepFlappy({ ...state, y: 300, vy: 0, over: false, gaps: 99, time: 0 }, FRAME);
        for (const pipe of state.pipes) if (!known.has(pipe.id)) tops.push(pipe.gapTop);
      }
      expect(tops.length).toBe(120);
      for (let i = 1; i < tops.length; i++) expect(tops[i - 1] - tops[i]).toBeLessThanOrEqual(MAX_GAP_RISE);
    }
  });

  test("hitting a pipe ends the run", () => {
    let state = newFlappy(360, 640, 1);
    state = { ...state, nextIn: 1e9, pipes: [{ id: 9, x: birdX(state) + 20, gapTop: 0, gapHeight: 60, passed: false }] };
    expect(runFor(state, 1, stepFlappy, (s) => (s.vy > 0 ? flap(s) : s)).over).toBe(true);
  });
});

describe("fitting the start card", () => {
  test("leaves a card that fits alone, and shrinks one taller than the stage", () => {
    expect(cardFitScale(200, 400, 20)).toBe(1);
    expect(cardFitScale(300, 280, 20)).toBeCloseTo(0.8);
    expect(cardFitScale(300, 30, 20)).toBe(0);
  });

  test("doesn't scale before the card or stage has been measured", () => {
    expect(cardFitScale(null, 280, 20)).toBe(1);
    expect(cardFitScale(300, null, 20)).toBe(1);
  });
});

describe("fitting the board", () => {
  test("the board is the stage, up to the game's largest size", () => {
    expect(fitBoard({ width: 390.6, height: 700 }, { width: 720, height: 1400 })).toEqual({ width: 390, height: 700 });
    expect(fitBoard({ width: 1400, height: 900 }, { width: 1200, height: 400 })).toEqual({ width: 1200, height: 400 });
  });

  test("the ground line is found from the stage, the centred board and the scale", () => {
    expect(groundLine({ y: 60, height: 700 }, 700, 644, 1)).toBe(704);
    expect(groundLine({ y: 60, height: 800 }, 600, 644, 0.5)).toBe(60 + 100 + 322);
  });

  test("a run that started on another size is scaled to fit, keeping its shape", () => {
    expect(fitScale(null, { width: 390, height: 700 })).toBe(1);
    expect(fitScale({ width: 390, height: 700 }, { width: 390, height: 700 })).toBe(1);
    expect(fitScale({ width: 390, height: 700 }, { width: 390, height: 350 })).toBe(0.5);
    expect(fitScale({ width: 400, height: 400 }, { width: 800, height: 1200 })).toBe(2);
    expect(fitScale({ width: 0, height: 400 }, { width: 800, height: 1200 })).toBe(1);
  });
});

describe("leaving a game", () => {
  test("only a run in progress asks first; the start and game-over screens just go back", () => {
    expect(needsLeaveConfirm("playing")).toBe(true);
    expect(needsLeaveConfirm("ready")).toBe(false);
    expect(needsLeaveConfirm("over")).toBe(false);
  });

  test("on web, a touch at either edge of the screen is where the browser's swipe back starts", () => {
    expect(atSwipeEdge(0, 390)).toBe(true);
    expect(atSwipeEdge(SWIPE_EDGE, 390)).toBe(true);
    expect(atSwipeEdge(390 - SWIPE_EDGE, 390)).toBe(true);
    expect(atSwipeEdge(SWIPE_EDGE + 1, 390)).toBe(false);
    expect(atSwipeEdge(195, 390)).toBe(false);
  });
});
