import { describe, expect, test } from "vitest";
import { AFRO_RISE, sitsOnAfro, tagRise } from "./hatHeight";

const AFRO = 10;
const SHORT = 0;
const [BERET, BOW, HEADBAND, PARTY, CROWN] = [5, 6, 7, 8, 9];
const afroHeight = AFRO_RISE / 0.86;

describe("name tags over hats", () => {
  test("a bow on an afro lifts the tag by the afro's height, like the party hat and crown", () => {
    expect(sitsOnAfro(AFRO, BOW)).toBe(true);
    expect(tagRise(AFRO, BOW, false)).toBeCloseTo(afroHeight);
    expect(tagRise(AFRO, PARTY, false)).toBeCloseTo(tagRise(SHORT, PARTY, false) + afroHeight);
    expect(tagRise(AFRO, CROWN, false)).toBeCloseTo(tagRise(SHORT, CROWN, false) + afroHeight);
  });

  test("without an afro a bow doesn't move the tag, and a party hat or crown does", () => {
    expect(tagRise(SHORT, BOW, false)).toBe(0);
    expect(tagRise(SHORT, PARTY, false)).toBe(0.28);
    expect(tagRise(SHORT, CROWN, false)).toBe(0.06);
  });

  test("a beret or headband on an afro doesn't stand on it, so the tag stays put", () => {
    expect(sitsOnAfro(AFRO, BERET)).toBe(false);
    expect(tagRise(AFRO, BERET, false)).toBe(0);
    expect(tagRise(AFRO, HEADBAND, false)).toBe(0);
  });

  test("a mohawk's crest lifts the tag a little when no taller hat does", () => {
    expect(tagRise(SHORT, 0, true)).toBe(0.08);
    expect(tagRise(SHORT, PARTY, true)).toBe(0.28);
  });
});
