import { describe, expect, test } from "vitest";
import {
  ASK_MS,
  coversPadLabel,
  HOME,
  HOME_ARRIVAL,
  isPingBars,
  PING_MAX_SAMPLE_MS,
  PING_PUBLISH_MS,
  pingBars,
  shouldPublishPing,
  addPingSample,
  pingEstimate,
  pingProbeDue,
  shownPing,
  PING_PROBE_MS,
  PING_SAMPLES,
  HEIGHT_SCALES,
  withHeight,
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
  LOOK_VERSION,
  NUDGES,
  NUDGES_RESET,
  OUTFITS,
  HAIR_STYLES,
  HATS,
  ACCESSORIES,
  GLASSES,
  EYES,
  MOUTHS,
  BLUSH,
  BEARDS,
  FRECKLES,
  MOLES,
  EYESHADOW,
  LIPSTICK,
  PANTS,
  OLD_GLASSES,
  nudge,
  PLACES,
  PLACE_OBSTACLES,
  PLACE_TITLES,
  PORTALS,
  PORTAL_RADIUS,
  SEATS,
  seatIn,
  arrivalSpot,
  ARRIVE_APART,
  clearSpot,
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
  expect(isValidLook({ skin: 0, hair: 17, hairColour: 0, shirt: 0 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 18, hairColour: 0, shirt: 0 })).toBe(false);
  // Version 2's face, body and extras: each bounded, all optional.
  const v2 = { v: 2, skin: 0, hair: 0, hairColour: 0, shirt: 0, face: 4, eyes: 5, eyeColour: 5, brows: 4, nose: 3, mouth: 4, height: 4, build: 4, freckles: 1, blush: 2, beard: 3 };
  expect(isValidLook(v2)).toBe(true);
  expect(isValidLook({ ...v2, height: 5 })).toBe(false);
  expect(isValidLook({ ...v2, freckles: 4 })).toBe(false);
  expect(isValidLook({ ...v2, v: 3 })).toBe(true);
  expect(isValidLook({ ...v2, v: 4 })).toBe(false);
  expect(isValidLook({ ...v2, v: 1.5 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, hat: 0.5 })).toBe(false);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, outfit: OUTFITS.length - 1 })).toBe(true);
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 0, outfit: OUTFITS.length })).toBe(false);
  expect(lookPart({ skin: 0, hair: 0, hairColour: 0, shirt: 0 }, "outfit")).toBe(0);
  expect(OUTFITS[10]).toBe("Flannel");
  expect(isValidLook({ skin: 0, hair: 0, hairColour: 0, shirt: 4, outfit: 10 })).toBe(true);
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
  expect(tall.height).toBeCloseTo(1.2);
  expect(small.height).toBeCloseTo(0.8);
  expect(tall.width).toBeCloseTo(1.15);
  expect(small.width).toBeCloseTo(0.85);
});

describe("height", () => {
  const plain = { skin: 1, hair: 2, hairColour: 3, shirt: 4 };
  const headAbove = 0.49;

  test("every step is a tenth taller than the one before, from 0.8 to 1.2", () => {
    expect(HEIGHT_SCALES.length).toBe(LOOK_SIZES.height);
    const steps = HEIGHT_SCALES.map((_, height) => bodyScale({ ...plain, height }).height);
    expect(steps).toEqual([0.8, 0.9, 1, 1.1, 1.2]);
  });

  test("the tallest stands about 1.3 times the shortest, head included", () => {
    const top = (height: number) => bodyScale({ ...plain, height }).height + headAbove;
    expect(top(4) / top(0)).toBeGreaterThan(1.28);
    expect(top(4) / top(0)).toBeLessThan(1.35);
    expect(bodyScale({ ...plain, height: 4 }).height / bodyScale({ ...plain, height: 0 }).height).toBeCloseTo(1.5);
  });

  test("someone who never chose a height gets one from their email, the same everywhere", () => {
    const emails = Array.from({ length: 200 }, (_, i) => `person${i}@sow.org.au`);
    const heights = emails.map((email) => withHeight(plain, email).height);
    expect(new Set(heights)).toEqual(new Set([0, 1, 2, 3, 4]));
    expect(heights.filter((h) => h === 2).length).toBeGreaterThan(heights.filter((h) => h === 0).length);
    for (const email of emails.slice(0, 10)) expect(withHeight(plain, email)).toEqual(withHeight(plain, email));
    for (const email of emails.slice(0, 10)) expect(lookFor(email).height).toBe(withHeight(plain, email).height);
  });

  test("a chosen height is kept, even the middle one", () => {
    expect(withHeight({ ...plain, height: 2 }, "person0@sow.org.au").height).toBe(2);
    expect(withHeight({ ...plain, height: 0 }, "person1@sow.org.au").height).toBe(0);
    const look = { ...plain, height: 4 };
    expect(withHeight(look, "x")).toBe(look);
  });
});

test("every choice list has one name per choice", () => {
  const lists = { hair: HAIR_STYLES, hat: HATS, accessory: ACCESSORIES, glasses: GLASSES, eyes: EYES, mouth: MOUTHS, blush: BLUSH, beard: BEARDS, freckles: FRECKLES, mole: MOLES, eyeshadow: EYESHADOW, lipstick: LIPSTICK, pants: PANTS, outfit: OUTFITS } as const;
  for (const [part, names] of Object.entries(lists)) expect([part, names.length]).toEqual([part, LOOK_SIZES[part as keyof typeof lists]]);
});

describe("version 3 looks", () => {
  const v2 = { v: 2, skin: 2, hair: 10, hairColour: 4, shirt: 3, face: 3, eyes: 3, eyeColour: 2, brows: 2, nose: 1, mouth: 2, height: 4, build: 0, freckles: 1, blush: 2, beard: 3, accessory: 2 };
  const v3 = {
    ...v2,
    v: LOOK_VERSION,
    hair: 17,
    skin: 11,
    hat: 9,
    accessory: 7,
    browColour: 12,
    eyeY: 0,
    eyeGap: 6,
    eyeSize: 6,
    eyeTilt: 0,
    browY: 6,
    browGap: 0,
    browSize: 0,
    browTilt: 6,
    mouthY: 0,
    mouthSize: 6,
    mouthTilt: 6,
    glasses: 4,
    eyeshadow: 5,
    lipstick: 5,
    mole: 5,
    pants: 3,
    pantsColour: 7,
    favourite: 11,
  };

  test("the new parts are bounded, and the version goes up to 3", () => {
    expect(LOOK_VERSION).toBe(3);
    expect(isValidLook(v3)).toBe(true);
    for (const part of ["browColour", "glasses", "eyeshadow", "lipstick", "mole", "pants", "pantsColour", "favourite", ...NUDGES] as const) {
      expect([part, isValidLook({ ...v3, [part]: LOOK_SIZES[part] })]).toEqual([part, false]);
      expect([part, isValidLook({ ...v3, [part]: -1 })]).toEqual([part, false]);
      expect([part, isValidLook({ ...v3, [part]: 1.5 })]).toEqual([part, false]);
    }
  });

  test("a look from before version 3 keeps how it looked", () => {
    expect(isValidLook(v2)).toBe(true);
    // Every slider in the middle, which is where each part was drawn before.
    for (const part of NUDGES) expect([part, nudge(v2, part)]).toEqual([part, 0]);
    for (const part of ["browColour", "glasses", "eyeshadow", "lipstick", "mole", "pants", "pantsColour", "favourite"] as const) {
      expect([part, lookPart(v2, part)]).toEqual([part, 0]);
    }
    expect(NUDGES_RESET.eyeY).toBe(3);
  });

  test("old glasses (an extra) still count as round glasses until glasses are picked", () => {
    const old = { skin: 0, hair: 0, hairColour: 0, shirt: 0, accessory: OLD_GLASSES };
    expect(lookPart(old, "glasses")).toBe(1);
    expect(lookPart({ ...old, glasses: 0 }, "glasses")).toBe(0);
    expect(lookPart({ ...old, glasses: 3 }, "glasses")).toBe(3);
    expect(lookPart({ ...old, accessory: 2 }, "glasses")).toBe(0);
  });

  test("a choice this app doesn't know (from a newer one) draws as the default", () => {
    const future = { ...v3, hat: 99, eyeY: 40, favourite: 2.5, height: -3 };
    expect(lookPart(future, "hat")).toBe(0);
    expect(nudge(future, "eyeY")).toBe(0);
    expect(lookPart(future, "favourite")).toBe(0);
    expect(lookPart(future, "height")).toBe(2);
    expect(bodyScale(future).height).toBeCloseTo(1);
  });

  test("randomise covers the new parts, keeps sliders near the middle and never picks the old glasses extra", () => {
    for (const r of [0, 0.1, 0.25, 0.5, 0.75, 0.99]) {
      const look = randomLook(() => r);
      expect(isValidLook(look)).toBe(true);
      expect(look.v).toBe(LOOK_VERSION);
      for (const part of NUDGES) expect(Math.abs(nudge(look, part))).toBeLessThanOrEqual(1);
      expect(look.accessory).not.toBe(OLD_GLASSES);
      for (const part of ["glasses", "eyeshadow", "lipstick", "mole", "pants", "pantsColour", "favourite", "browColour"] as const) expect(look[part]).toBeDefined();
    }
    // Extras are rare: a high roll means none.
    const plain = randomLook(() => 0.99);
    expect([plain.glasses, plain.eyeshadow, plain.lipstick, plain.mole, plain.hat]).toEqual([0, 0, 0, 0, 0]);
    // Index 1 (the old glasses) comes out as no extra: the extra is rolled
    // first (0.3 says "have one", 0.15 picks index 1).
    let i = 0;
    const rolls = [0.3, 0.15];
    expect(randomLook(() => rolls[i++] ?? 0.5).accessory).toBe(0);
  });
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
        expect(Math.hypot(spot.x - back.x, spot.z - back.z)).toBeLessThan(4.5);
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

describe("ping", () => {
  test("round trips bucket into one to four bars", () => {
    expect(pingBars(0)).toBe(4);
    expect(pingBars(20)).toBe(4);
    expect(pingBars(100)).toBe(4);
    expect(pingBars(101)).toBe(3);
    expect(pingBars(200)).toBe(3);
    expect(pingBars(201)).toBe(2);
    expect(pingBars(400)).toBe(2);
    expect(pingBars(401)).toBe(1);
    expect(pingBars(9000)).toBe(1);
  });

  test("only one to four counts as bars", () => {
    expect([0, 1, 2, 3, 4, 5, 2.5, "3", null].map(isPingBars)).toEqual([false, true, true, true, true, false, false, false, false]);
  });

  test("the ping is the median of the last five probes, so one slow frame doesn't move it", () => {
    expect(pingEstimate([])).toBeNull();
    expect(pingEstimate([30])).toBe(30);
    expect(pingEstimate([30, 50])).toBe(40);
    expect(pingEstimate([28, 31, 140, 29, 33])).toBe(31);
    let samples: number[] = [];
    for (const ms of [500, 30, 32, 29, 31, 35]) samples = addPingSample(samples, ms);
    expect(samples).toEqual([30, 32, 29, 31, 35]);
    expect(samples.length).toBe(PING_SAMPLES);
    expect(pingEstimate(samples)).toBe(31);
  });

  test("a new visit or room shows measuring until its own first probe lands", () => {
    const reading = { visit: "me:garden-1", ms: 42 };
    expect(shownPing(reading, "me:garden-1")).toBe(42);
    expect(shownPing(reading, "me:cafe-1")).toBeNull();
    expect(shownPing(reading, "again:garden-1")).toBeNull();
    expect(shownPing(reading, null)).toBeNull();
    expect(shownPing(null, "me:garden-1")).toBeNull();
    expect(shownPing({ visit: "me:cafe-1", ms: 31 }, "me:cafe-1")).toBe(31);
  });

  test("a probe's time is clamped to a sane range", () => {
    expect(addPingSample([], -5)).toEqual([0]);
    expect(addPingSample([], 60_000)).toEqual([PING_MAX_SAMPLE_MS]);
  });

  test("the first three probes go a second apart, then one every 15 s", () => {
    expect(pingProbeDue({ taken: 0, lastAt: null, now: 0 })).toBe(true);
    expect(pingProbeDue({ taken: 1, lastAt: 1000, now: 1999 })).toBe(false);
    expect(pingProbeDue({ taken: 2, lastAt: 1000, now: 2000 })).toBe(true);
    expect(pingProbeDue({ taken: 3, lastAt: 1000, now: 2000 })).toBe(false);
    expect(pingProbeDue({ taken: 5, lastAt: 1000, now: 1000 + PING_PROBE_MS - 1 })).toBe(false);
    expect(pingProbeDue({ taken: 5, lastAt: 1000, now: 1000 + PING_PROBE_MS })).toBe(true);
  });

  test("a new bucket is published at once the first time", () => {
    expect(shouldPublishPing({ bars: 3, published: null, publishedAt: null, now: 1000 })).toBe(true);
  });

  test("the same bucket is never published again", () => {
    expect(shouldPublishPing({ bars: 3, published: 3, publishedAt: 0, now: 10 * PING_PUBLISH_MS })).toBe(false);
  });

  test("a changed bucket waits until 30 s after the last publish", () => {
    expect(shouldPublishPing({ bars: 2, published: 3, publishedAt: 1000, now: 1000 + PING_PUBLISH_MS - 1 })).toBe(false);
    expect(shouldPublishPing({ bars: 2, published: 3, publishedAt: 1000, now: 1000 + PING_PUBLISH_MS })).toBe(true);
  });
});
describe("arriving by a pad", () => {
  test("never stands over a pad's name, by a pad or from the place menu", () => {
    for (const to of [...PLACES, HOME] as const) {
      for (const from of [...PLACES, HOME] as const) {
        if (from === to) continue;
        expect(coversPadLabel(to, arrivalSpot(from, to)), `${from} to ${to}`).toBe(false);
      }
    }
  });

  test("every place reached from home leaves its labels clear", () => {
    for (const to of PLACES) {
      const spot = arrivalSpot(HOME, to);
      expect(coversPadLabel(to, spot), to).toBe(false);
      expect(clampTarget(spot.x, spot.z, to)).toEqual(spot);
    }
  });

  test("a home puts you just inside the door", () => {
    expect(arrivalSpot("garden", HOME)).toEqual(HOME_ARRIVAL);
  });
});

describe("arriving among people", () => {
  test("lands a body width from everyone already there", () => {
    const taken = [{ ...HOME_ARRIVAL }, { x: HOME_ARRIVAL.x + 0.5, z: HOME_ARRIVAL.z }];
    const spot = clearSpot(HOME, { ...HOME_ARRIVAL }, { taken });
    for (const other of taken) expect(Math.hypot(spot.x - other.x, spot.z - other.z)).toBeGreaterThanOrEqual(ARRIVE_APART);
    expect(Math.hypot(spot.x - HOME_ARRIVAL.x, spot.z - HOME_ARRIVAL.z)).toBeLessThan(3);
  });

  test("a spot on furniture is moved off it even with nobody around", () => {
    const table = { id: "table", x: 0, z: -4, rx: 1, rz: 0.6 };
    const spot = clearSpot(HOME, { x: 0, z: -4 }, { extra: [table] });
    expect(Math.hypot(spot.x / table.rx, (spot.z + 4) / table.rz)).toBeGreaterThanOrEqual(1);
  });

  test("an empty spot is kept", () => {
    expect(clearSpot("garden", { x: 1, z: 1 }, { taken: [{ x: 4, z: 4 }] })).toEqual({ x: 1, z: 1 });
  });

  test("with nowhere clear it stays put", () => {
    const crowd = [];
    for (let x = -12; x <= 12; x += 0.5) for (let z = -16; z <= 12; z += 0.5) crowd.push({ x, z });
    expect(clearSpot("garden", { x: 1, z: 1 }, { taken: crowd })).toEqual({ x: 1, z: 1 });
  });
});

describe("extra obstacles", () => {
  test("a spot inside one is pushed to its rim", () => {
    const at = clampTarget(0, -4, HOME, [{ id: "table", x: 0, z: -4, rx: 1, rz: 0.6 }]);
    expect(Math.hypot(at.x / 1, (at.z + 4) / 0.6)).toBeGreaterThanOrEqual(1);
  });
});
