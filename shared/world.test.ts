import { describe, expect, test } from "vitest";
import {
  ASK_MS,
  BUCKETS,
  canHear,
  cleanLine,
  clampTarget,
  fullBucket,
  halfWidthAt,
  hash,
  HEAR_RADIUS,
  EMOTE_IDS,
  EMOTE_TRAY,
  isEmote,
  isMutual,
  liveMutual,
  MUTUAL_MS,
  openAsk,
  LOOK_SIZES,
  OUTFITS,
  PLACES,
  PLACE_OBSTACLES,
  PLACE_TITLES,
  PORTALS,
  PORTAL_RADIUS,
  SEATS,
  seatIn,
  arrivalSpot,
  isPlace,
  portalAt,
  bodyScale,
  isValidLook,
  lookFor,
  lookPart,
  randomLook,
  MAX_SAY_LENGTH,
  OBSTACLES,
  posAt,
  SPAWN,
  spawnFor,
  tagName,
  takeToken,
  WALK_BOUNDS,
  WALK_SPEED,
  askInfo,
  chantAt,
  DUEL_REVEAL_MS,
  duelWinner,
  inWater,
  isAskKind,
  isDuelPick,
} from "./world";

describe("posAt", () => {
  const walk = { fromX: 0, fromZ: 0, toX: 3, toZ: 4, startedAt: 1000 };
  const duration = (5 / WALK_SPEED) * 1000;

  test("walks a straight line at the walking speed", () => {
    expect(posAt(walk, 1000)).toMatchObject({ x: 0, z: 0, walking: true });
    const half = posAt(walk, 1000 + duration / 2);
    expect(half.x).toBeCloseTo(1.5);
    expect(half.z).toBeCloseTo(2);
    expect(posAt(walk, 1000 + duration)).toMatchObject({ x: 3, z: 4, walking: false, arrivesAt: 1000 + duration });
    expect(posAt(walk, 0)).toMatchObject({ x: 0, z: 0 });
    expect(posAt(walk, 1000).heading).toBeCloseTo(Math.atan2(3, 4));
  });

  test("standing still faces the camera", () => {
    expect(posAt({ fromX: 1, fromZ: 1, toX: 1, toZ: 1, startedAt: 0 }, 5)).toEqual({
      x: 1,
      z: 1,
      walking: false,
      heading: 0,
      arrivesAt: 0,
    });
  });
});

test("canHear stops at the hearing radius", () => {
  expect(canHear({ x: 0, z: 0 }, { x: HEAR_RADIUS, z: 0 })).toBe(true);
  expect(canHear({ x: 0, z: 0 }, { x: HEAR_RADIUS + 0.01, z: 0 })).toBe(false);
});

describe("clampTarget", () => {
  test("keeps a spot inside the courtyard", () => {
    expect(clampTarget(1, 1)).toEqual({ x: 1, z: 1 });
    expect(clampTarget(99, -99)).toEqual({ x: WALK_BOUNDS.maxX, z: WALK_BOUNDS.minZ });
    expect(clampTarget(Number.NaN, 0)).toEqual(SPAWN);
  });

  test("pushes a spot out of an obstacle", () => {
    const bath = OBSTACLES[0];
    const out = clampTarget(bath.x + 0.2, bath.z);
    expect(out.x).toBeGreaterThan(bath.x + bath.rx);
    expect(out.z).toBeCloseTo(bath.z);
    const centre = clampTarget(bath.x, bath.z);
    expect(centre.x).toBeCloseTo(bath.x);
    expect(centre.z).toBeGreaterThan(bath.z + bath.rz);
  });
});

test("lets you walk into the pond, and narrows toward the front", () => {
  expect(OBSTACLES.some((o) => o.id === ("pond" as string))).toBe(false);
  const out = clampTarget(-3.5, 2.2);
  expect(out).toEqual({ x: -3.5, z: 2.2 });
  expect(out.x).toBeGreaterThanOrEqual(-halfWidthAt(out.z));
  expect(halfWidthAt(0)).toBe(WALK_BOUNDS.maxX);
  expect(clampTarget(99, WALK_BOUNDS.maxZ).x).toBeCloseTo(halfWidthAt(WALK_BOUNDS.maxZ));
  expect(halfWidthAt(WALK_BOUNDS.maxZ)).toBeLessThan(3);
});

test("spawnFor stays near the spawn point and is stable", () => {
  const a = spawnFor("anna@sow.org.au");
  expect(a).toEqual(spawnFor("anna@sow.org.au"));
  expect(Math.abs(a.x - SPAWN.x)).toBeLessThanOrEqual(1);
  expect(SPAWN.z - a.z).toBeLessThanOrEqual(0.8);
});

test("lookFor picks a stable look in range", () => {
  expect(hash("a")).not.toBe(hash("b"));
  for (const seed of ["a", "b", "anna@sow.org.au", ""]) {
    const look = lookFor(seed);
    expect(look).toEqual(lookFor(seed));
    expect(look.skin).toBeLessThan(LOOK_SIZES.skin);
    expect(look.hair).toBeLessThan(LOOK_SIZES.hair);
    expect(look.hairColour).toBeLessThan(LOOK_SIZES.hairColour);
    expect(look.shirt).toBeLessThan(LOOK_SIZES.shirt);
  }
});

test("isValidLook checks every part, and randomLook stays in range", () => {
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, hat: 4, accessory: 3 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 11, hairColour: 0, shirt: 0 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 12, hairColour: 0, shirt: 0 })).toBe(false);
  // Version 2's face, body and extras: each bounded, all optional.
  const v2 = { v: 2, skin: 0, hair: 0, hairColour: 0, shirt: 0, face: 4, eyes: 5, eyeColour: 5, brows: 4, nose: 3, mouth: 4, height: 4, build: 4, freckles: 1, blush: 2, beard: 3 };
  expect(isValidLook(v2)).toBe(true);
  expect(isValidLook({ ...v2, height: 5 })).toBe(false);
  expect(isValidLook({ ...v2, freckles: 2 })).toBe(false);
  expect(isValidLook({ ...v2, v: 3 })).toBe(false);
  expect(isValidLook({ ...v2, v: 1.5 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, hat: 0.5 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, outfit: OUTFITS.length - 1 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, outfit: OUTFITS.length })).toBe(false);
  expect(lookPart({ skin: 0, hair: 0, hairColour: 0, shirt: 0 }, "outfit")).toBe(0);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: undefined as unknown as number })).toBe(false);
  for (const r of [0, 0.3, 0.55, 0.99]) expect(isValidLook(randomLook(() => r))).toBe(true);
  expect(isValidLook(randomLook())).toBe(true);
});

test("a look from before version 2 draws with the old defaults, and the body stays in range", () => {
  const old = { skin: 1, hair: 2, hairColour: 3, shirt: 4 };
  expect(lookPart(old, "height")).toBe(2);
  expect(lookPart(old, "blush")).toBe(1);
  expect(lookPart(old, "skin")).toBe(1);
  expect(bodyScale(old)).toEqual({ height: 1, width: 1 });
  const tall = bodyScale({ ...old, height: 4, build: 4 });
  const small = bodyScale({ ...old, height: 0, build: 0 });
  expect(tall.height).toBeCloseTo(1.12);
  expect(small.height).toBeCloseTo(0.88);
  expect(tall.width).toBeCloseTo(1.15);
  expect(small.width).toBeCloseTo(0.85);
});

test("tagName shows a short first name and the last name's initial", () => {
  expect(tagName("  Grace   Lee ")).toBe("Grace L.");
  expect(tagName("Daniel Chan kim")).toBe("Daniel K.");
  expect(tagName("Grace")).toBe("Grace");
  expect(tagName("Maximiliannnnnnnn Ng")).toBe("Maximiliannnn… N.");
  expect(tagName("")).toBe("Someone");
  expect(tagName("Maximiliannnnnnnn")).toBe("Maximiliannnn…");
  expect(tagName("abcdefghijkl😀zzz")).toBe("abcdefghijkl😀…");
});

test("cleanLine trims, joins lines and caps the length", () => {
  expect(cleanLine("  hi\n  there ")).toBe("hi there");
  expect(cleanLine("   ")).toBeNull();
  expect(Array.from(cleanLine("🌸".repeat(200))!)).toHaveLength(MAX_SAY_LENGTH);
});

test("cleanLine drops characters nobody can see", () => {
  expect(cleanLine("\u200B")).toBeNull();
  expect(cleanLine("\u2060\uFEFF \u202E")).toBeNull();
  expect(cleanLine("\u0301\u0301")).toBeNull();
  expect(cleanLine("hi\u202Ethere\u0000")).toBe("hi there");
  expect(cleanLine("👨\u200D👩\u200D👧")).toBe("👨\u200D👩\u200D👧");
  expect(cleanLine("é")).toBe("é");
});


test("isEmote and isMutual know the choices, and nothing inherited", () => {
  expect(EMOTE_IDS).toContain("wave");
  expect(EMOTE_TRAY.every((id) => EMOTE_IDS.includes(id))).toBe(true);
  expect([isEmote("wave"), isEmote("👋"), isEmote("toString")]).toEqual([true, false, false]);
  expect([isMutual("highFive"), isMutual("hug"), isMutual("constructor")]).toEqual([true, false, false]);
});

describe("mutual actions", () => {
  const ask = { kind: "highFive", to: "b", at: 1000 };
  const reply = { kind: "highFive", to: "a", askAt: 1000, at: 3000 };

  test("an ask is open for ASK_MS", () => {
    expect(openAsk(ask, 1000 + ASK_MS - 1)).toBe(ask);
    expect(openAsk(ask, 1000 + ASK_MS)).toBeNull();
    expect(openAsk(undefined, 0)).toBeNull();
  });

  test("plays from the answer for MUTUAL_MS, only when the ask and answer match", () => {
    const live = (r: typeof reply | undefined, now: number, a = ask) => liveMutual({ id: "a", ask: a }, { id: "b", reply: r }, now);
    expect(live(reply, 3000)).toEqual({ kind: "highFive", progress: 0 });
    expect(live(reply, 3000 + MUTUAL_MS / 2)!.progress).toBeCloseTo(0.5);
    expect(live(reply, 3000 + MUTUAL_MS)).toBeNull();
    expect(live(reply, 2999)).toBeNull();
    expect(live(undefined, 3000)).toBeNull();
    expect(live({ ...reply, to: "c" }, 3000)).toBeNull();
    expect(live(reply, 3000, { ...ask, to: "c" })).toBeNull();
    expect(live({ ...reply, askAt: 999 }, 3000)).toBeNull();
    expect(live({ ...reply, kind: "hug" }, 3000)).toBeNull();
    expect(live({ ...reply, kind: "hug" }, 3000, { ...ask, kind: "hug" })).toBeNull();
  });
});

describe("takeToken", () => {
  test("allows a burst, then one per refill", () => {
    let bucket = fullBucket("move", 0);
    for (let i = 0; i < BUCKETS.move.burst; i++) {
      const r = takeToken("move", bucket, 0);
      if (!r.ok) throw new Error("burst refused");
      bucket = r.bucket;
    }
    expect(takeToken("move", bucket, 0)).toEqual({ ok: false, retryInMs: BUCKETS.move.refillMs });
    const third = BUCKETS.move.refillMs / 3;
    expect(takeToken("move", bucket, third)).toEqual({ ok: false, retryInMs: Math.ceil(BUCKETS.move.refillMs - third) });
    expect(takeToken("move", bucket, BUCKETS.move.refillMs).ok).toBe(true);
  });

  test("never banks more than the burst", () => {
    const r = takeToken("say", { tokens: 0, at: 0 }, 10 * 60_000);
    expect(r).toEqual({ ok: true, bucket: { tokens: BUCKETS.say.burst - 1, at: 10 * 60_000 } });
  });
});

describe("places and the pads between them", () => {
  test("every place has a title, and only the listed ones are places", () => {
    for (const place of PLACES) expect(PLACE_TITLES[place]).toMatch(/^The /);
    expect(isPlace("chapel")).toBe(true);
    expect(isPlace("moon")).toBe(false);
    expect(isPlace(undefined)).toBe(false);
  });

  test("every pad is somewhere you can stand, and clear of the other pads", () => {
    for (const place of PLACES) {
      const pads = PORTALS[place];
      for (const pad of pads) {
        expect(clampTarget(pad.x, pad.z, place)).toEqual({ x: pad.x, z: pad.z });
        expect(portalAt(place, pad)).toBe(pad);
        for (const other of pads) {
          if (other !== pad) expect(Math.hypot(other.x - pad.x, other.z - pad.z)).toBeGreaterThan(PORTAL_RADIUS * 3);
        }
      }
    }
    expect(portalAt("garden", { x: 0, z: 0 })).toBeNull();
  });

  test("the map: which places lead to which, and every way has a way back", () => {
    const leadsTo = Object.fromEntries(PLACES.map((place) => [place, PORTALS[place].map((pad) => pad.to).sort()]));
    expect(leadsTo).toEqual({
      garden: ["beach", "campfire", "chapel"],
      beach: ["campfire", "garden"],
      campfire: ["beach", "cafe", "garden"],
      chapel: ["cafe", "garden"],
      cafe: ["campfire", "chapel"],
    });
    for (const place of PLACES) {
      for (const pad of PORTALS[place]) expect(PORTALS[pad.to].some((back) => back.to === place)).toBe(true);
    }
  });

  test("you arrive beside the pad that leads back, never on a pad", () => {
    for (const from of PLACES) {
      for (const pad of PORTALS[from]) {
        const spot = arrivalSpot(from, pad.to);
        expect(portalAt(pad.to, spot)).toBeNull();
        expect(clampTarget(spot.x, spot.z, pad.to)).toEqual(spot);
        const back = PORTALS[pad.to].find((p) => p.to === from)!;
        expect(Math.hypot(spot.x - back.x, spot.z - back.z)).toBeLessThan(2.5);
      }
    }
    expect(portalAt("beach", arrivalSpot("chapel", "beach"))).toBeNull();
  });

  test("each place keeps people out of its own furniture only", () => {
    const pew = PLACE_OBSTACLES.chapel[0];
    expect(clampTarget(pew.x, pew.z, "chapel")).not.toEqual({ x: pew.x, z: pew.z });
    expect(clampTarget(pew.x, pew.z, "beach")).toEqual({ x: pew.x, z: pew.z });
    const bath = PLACE_OBSTACLES.garden.find((o) => o.id === "birdbath")!;
    expect(clampTarget(bath.x + 0.2, bath.z, "beach")).toEqual({ x: bath.x + 0.2, z: bath.z });
    expect(clampTarget(bath.x + 0.2, bath.z)).not.toEqual({ x: bath.x + 0.2, z: bath.z });
  });
});

describe("seats", () => {
  test("every seat is inside its place, has its own id, and is clear of the pads", () => {
    for (const place of PLACES) {
      const ids = SEATS[place].map((seat) => seat.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const seat of SEATS[place]) {
        expect(seat.z).toBeGreaterThanOrEqual(WALK_BOUNDS.minZ);
        expect(seat.z).toBeLessThanOrEqual(WALK_BOUNDS.maxZ);
        expect(Math.abs(seat.x)).toBeLessThanOrEqual(halfWidthAt(seat.z));
        expect(portalAt(place, seat)).toBeNull();
        expect(seatIn(place, seat.id)).toBe(seat);
      }
    }
  });

  test("every place has somewhere to sit, and a seat belongs to one place", () => {
    for (const place of PLACES) expect(SEATS[place].length).toBeGreaterThan(0);
    expect(seatIn("garden", "blanket-0")).not.toBeNull();
    expect(seatIn("beach", "blanket-0")).toBeNull();
    expect(seatIn("garden", undefined)).toBeNull();
  });

  test("people sharing a bench have room, and bench seats sit inside the furniture", () => {
    for (const place of PLACES) {
      const seats = SEATS[place];
      for (const a of seats) {
        for (const b of seats) {
          if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.7);
        }
        if (a.height > 0) expect(clampTarget(a.x, a.z, place)).not.toEqual({ x: a.x, z: a.z });
      }
    }
  });
});

describe("water", () => {
  test("the pond and the sea are water; the path and the sand aren't", () => {
    expect(inWater("garden", { x: -2.9, z: 2.2 })).toBe(true);
    expect(inWater("garden", { x: 0.2, z: 6.2 })).toBe(false);
    expect(inWater("beach", { x: 0, z: -9 })).toBe(true);
    expect(inWater("beach", { x: 0, z: -6 })).toBe(false);
    expect(inWater("chapel", { x: -2.9, z: 2.2 })).toBe(false);
    expect(clampTarget(0, -10.5, "beach").z).toBeLessThan(-7.4);
  });
});

describe("rock paper scissors", () => {
  test("rock beats scissors, scissors beats paper, paper beats rock", () => {
    expect(duelWinner("rock", "scissors")).toBe("a");
    expect(duelWinner("scissors", "rock")).toBe("b");
    expect(duelWinner("scissors", "paper")).toBe("a");
    expect(duelWinner("rock", "paper")).toBe("b");
    expect(duelWinner("paper", "paper")).toBe("draw");
    expect(isDuelPick("rock")).toBe(true);
    expect(isDuelPick("lizard")).toBe(false);
    expect(isDuelPick(3)).toBe(false);
  });

  test("the chant lands Rock! on the reveal and stops after it", () => {
    const end = 10_000;
    expect(chantAt(end, end - 3000)).toBeNull();
    expect(chantAt(end, end - 2400)).toBe("Scissors…");
    expect(chantAt(end, end - 1000)).toBe("Paper…");
    expect(chantAt(end, end)).toBe("Rock!");
    expect(chantAt(end, end + DUEL_REVEAL_MS - 1)).toBe("Rock!");
    expect(chantAt(end, end + DUEL_REVEAL_MS)).toBeNull();
  });

  test("a duel is something you can ask for, but not a mutual animation", () => {
    expect(isAskKind("rps")).toBe(true);
    expect(isMutual("rps")).toBe(false);
    expect(askInfo("rps")?.ask).toBe("Rock paper scissors?");
    expect(askInfo("highFive")?.ask).toBe("High five?");
    expect(askInfo("nope")).toBeNull();
    expect(askInfo(undefined)).toBeNull();
  });
});
