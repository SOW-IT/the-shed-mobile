import { useEffect } from "react";

export const SAVER_FRAME_MS = 1000 / 30;
export const AMBIENT_FRAME_MS = 1000 / 15;

type ClockPlan = { kind: "frames"; frameMs: number } | { kind: "wake"; at: number } | { kind: "still" };

export const planClock = ({
  moving,
  ambient = false,
  paused = false,
  now,
  deadlines,
  saver,
}: {
  moving: boolean;
  ambient?: boolean;
  paused?: boolean;
  now: number;
  deadlines: readonly (number | undefined)[];
  saver: boolean;
}): ClockPlan => {
  if (paused) return { kind: "still" };
  if (moving) return { kind: "frames", frameMs: saver ? SAVER_FRAME_MS : 0 };
  if (ambient && !saver) return { kind: "frames", frameMs: AMBIENT_FRAME_MS };
  let next = Infinity;
  for (const at of deadlines) if (at !== undefined && at > now && at < next) next = at;
  return next === Infinity ? { kind: "still" } : { kind: "wake", at: next };
};

export const frameDue = (last: number, at: number, frameMs: number) => frameMs <= 0 || at - last >= frameMs - 4;

/**
 * Whether the stage's clock should jump to `serverNow()` during this render:
 * on pausing or resuming, or when live inputs change while unpaused so waking
 * from a `still` clock never evaluates a new walk against a stale timestamp.
 */
export const shouldRefreshClock = ({
  wasPaused,
  paused,
  inputsChanged,
}: {
  wasPaused: boolean;
  paused: boolean;
  inputsChanged: boolean;
}): boolean => paused !== wasPaused || (!paused && inputsChanged);

export const useFrameTicks = (plan: ClockPlan, serverNow: () => number, setNow: (now: number) => void) => {
  const frameMs = plan.kind === "frames" ? plan.frameMs : -1;
  const wakeAt = plan.kind === "wake" ? plan.at : -1;
  useEffect(() => {
    if (frameMs >= 0) {
      let frame = 0;
      let last = 0;
      const tick = (at: number) => {
        if (frameDue(last, at, frameMs)) {
          last = at;
          setNow(serverNow());
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }
    if (wakeAt < 0) return;
    let id: ReturnType<typeof setTimeout>;
    const wake = () => {
      const at = serverNow();
      if (at < wakeAt) id = setTimeout(wake, wakeAt - at + 1);
      else setNow(at);
    };
    id = setTimeout(wake, Math.max(0, wakeAt - serverNow()) + 1);
    return () => clearTimeout(id);
  }, [frameMs, wakeAt, serverNow, setNow]);
};
