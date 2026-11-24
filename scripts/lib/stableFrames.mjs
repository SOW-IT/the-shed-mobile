// Screenshots are taken only once the screen has stopped moving, so a before
// and after pair of an unchanged screen are identical, pixel for pixel.

/** How many frames to take before giving up on a screen that keeps moving. */
export const FRAME_TRIES = 10;
/**
 * After a frame that hasn't settled, the iOS flow waits up to this long
 * before the next one, so a screen still loading (World's code is built by
 * Metro the first time it opens, about 10 s from a cleared cache) gets about
 * 20 s in all. A still screen settles on its second frame and never waits.
 */
export const FRAME_GAP_MS = 2000;

const HOUR = 60 * 60 * 1000;

/**
 * The instant both phases seed their events around: the top of the next
 * hour. Seeded times read as round hours and stay the same when verify runs
 * again within the hour. The seeded event runs from an hour before this to an
 * hour after, so it is under way for at least the next hour of real time.
 */
export const seedInstant = (now) => Math.floor(now / HOUR) * HOUR + HOUR;

/**
 * Judges a stream of frames per screen. A screen is settled when a frame is
 * byte-identical to the one before it. A still frame identical to the last
 * screen's screenshot may be that screen, before the app has started to move
 * to the new one, so it only counts after half the tries. After `tries`
 * frames the screen is taken as it is and reported as still moving.
 */
export const frameJudge = (tries = FRAME_TRIES) => {
  const previous = new Map();
  const moving = [];
  let lastShot = null;
  const judge = (name, frame) => {
    const last = previous.get(name);
    const count = (last?.count ?? 0) + 1;
    const still = Boolean(last && last.frame.equals(frame));
    const notArrived = still && lastShot !== null && lastShot.equals(frame) && count < Math.ceil(tries / 2);
    if (still && !notArrived) {
      previous.delete(name);
      lastShot = frame;
      return { settled: true, frames: count };
    }
    if (count >= tries) {
      previous.delete(name);
      lastShot = frame;
      moving.push(name);
      return { settled: true, frames: count, moving: true };
    }
    previous.set(name, { frame, count });
    return { settled: false, frames: count };
  };
  return { judge, moving };
};
