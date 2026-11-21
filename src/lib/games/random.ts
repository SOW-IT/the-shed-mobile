// A small seeded random source, so a game step is a pure function of its
// state and the tests can replay a run.

const nextSeed = (seed: number) => (seed + 0x6d2b79f5) | 0;

const unit = (seed: number) => {
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A random number in [0, 1), advancing the state's seed. */
export const random = (state: { seed: number }): number => {
  state.seed = nextSeed(state.seed);
  return unit(state.seed);
};

export const between = (state: { seed: number }, low: number, high: number) =>
  low + random(state) * (high - low);

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);
