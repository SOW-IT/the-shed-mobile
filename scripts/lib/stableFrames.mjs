// Screenshots are taken only once the screen has stopped moving, so a before
// and after pair of an unchanged screen are identical, pixel for pixel.

/** How many frames to take before giving up on a screen that keeps moving. */
export const FRAME_TRIES = 10;

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
 * byte-identical to the one before it. After `tries` frames it's taken as it
 * is and reported as still moving.
 */
export const frameJudge = (tries = FRAME_TRIES) => {
  const previous = new Map();
  const moving = [];
  const judge = (name, frame) => {
    const last = previous.get(name);
    const count = (last?.count ?? 0) + 1;
    if (last && last.frame.equals(frame)) {
      previous.delete(name);
      return { settled: true, frames: count };
    }
    if (count >= tries) {
      previous.delete(name);
      moving.push(name);
      return { settled: true, frames: count, moving: true };
    }
    previous.set(name, { frame, count });
    return { settled: false, frames: count };
  };
  return { judge, moving };
};
