import { useEffect, useRef } from "react";
import { Platform } from "react-native";

/** Physics steps are at most this long, so fast things can't skip a hit. */
const MAX_STEP = 1 / 60;
/** A frame longer than this (the app was in the background) counts as this. */
const MAX_FRAME = 0.1;

/** Runs a state forward by dt in steps no longer than MAX_STEP. */
export const advance = <S extends { over: boolean }>(state: S, dt: number, step: (s: S, dt: number) => S): S => {
  let current = state;
  let remaining = dt;
  while (remaining > 1e-6 && !current.over) {
    const slice = Math.min(remaining, MAX_STEP);
    current = step(current, slice);
    remaining -= slice;
  }
  return current;
};

/** Calls onFrame with the seconds since the last frame, every frame while running. */
export const useGameLoop = (running: boolean, onFrame: (dt: number) => void) => {
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  });
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last: number | null = null;
    const loop = (now: number) => {
      if (last !== null) onFrameRef.current(Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000)));
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [running]);
};

/**
 * Key presses on web. onBlur runs when the window loses focus, when a held
 * key's release would go unseen.
 */
export const useWebKeys = (
  onKey: (key: string, down: boolean, event: KeyboardEvent) => void,
  onBlur?: () => void,
  /** Off while the game isn't the screen in front, so its keys go elsewhere. */
  enabled = true
) => {
  const handlers = useRef({ onKey, onBlur });
  useEffect(() => {
    handlers.current = { onKey, onBlur };
  });
  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof window === "undefined") return;
    const down = (event: KeyboardEvent) => handlers.current.onKey(event.key, true, event);
    const up = (event: KeyboardEvent) => handlers.current.onKey(event.key, false, event);
    const blur = () => handlers.current.onBlur?.();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled]);
};
