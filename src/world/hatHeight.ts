// How high what's on top of the head reaches, for drawing hats and placing
// name tags. Pure, so it's tested without drawing anything.

/** How far (per scale) an afro stands above the top of the head. */
export const AFRO_RISE = 0.21;

/** Hats that sit on top of an afro instead of sinking into it: the bow, party hat and crown. */
export const sitsOnAfro = (hair: number, hat: number) => hair === 10 && (hat === 6 || hat === 8 || hat === 9);

/**
 * How much higher than a bare head someone's name tag sits, in world units
 * (a scale is 0.86 of one), so it doesn't cover what's on top: a party hat
 * or crown, a mohawk's crest, and the height of an afro under any hat that
 * sits on it (the bow included).
 */
export const tagRise = (hair: number, hat: number, crestShows: boolean) => {
  const own = hat === 8 ? 0.28 : hat === 9 ? 0.06 : 0;
  const onAfro = sitsOnAfro(hair, hat) ? AFRO_RISE / 0.86 : 0;
  return Math.max(own + onAfro, crestShows ? 0.08 : 0);
};
