// Hop's steering from what's held: every finger and key that's down, in the
// order it was pressed. The newest one still down steers; lift it and the
// one before takes over straight away. Pure, so the tests can play it out.

type Steer = -1 | 0 | 1;

/** A finger (where it is across the screen) or a key (the side it steers). */
export type Held = { id: string } & ({ x: number } | { side: -1 | 1 });

/** The fingers and keys down, oldest first. */
export type HeldStack = readonly Held[];

/** Pressed: now the newest, wherever it was before. */
export const press = (stack: HeldStack, held: Held): HeldStack => [...stack.filter((h) => h.id !== held.id), held];

/** Let go. */
export const lift = (stack: HeldStack, id: string): HeldStack => stack.filter((h) => h.id !== id);

/**
 * The fingers down now, by their x across the screen. A new one is pressed
 * (the newest); one that's moved keeps its place, so sliding across the middle
 * turns it round; one that's gone is let go. Keys stay as they are.
 */
export const fingers = (stack: HeldStack, down: readonly { id: string; x: number }[]): HeldStack => {
  const now = new Map(down.map((f) => [f.id, f.x]));
  const kept = stack.flatMap((h): Held[] => {
    if ("side" in h) return [h];
    const x = now.get(h.id);
    return x === undefined ? [] : [{ id: h.id, x }];
  });
  const known = new Set(kept.map((h) => h.id));
  return [...kept, ...down.filter((f) => !known.has(f.id))];
};

/** Every finger let go, keys left as they are. */
export const liftFingers = (stack: HeldStack): HeldStack => stack.filter((h) => "side" in h);

/** The way to steer: the newest held, by the side of the board's middle it's on. Nothing held, or no middle yet for a finger: none. */
export const steerOf = (stack: HeldStack, middle: number | null): Steer => {
  const newest = stack[stack.length - 1];
  if (!newest) return 0;
  if ("side" in newest) return newest.side;
  if (middle === null) return 0;
  return newest.x < middle ? -1 : 1;
};
