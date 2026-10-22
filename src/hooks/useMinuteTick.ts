import { useEffect, useState } from "react";

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => listeners.forEach((l) => l()), 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

export const useMinuteTick = () => {
  const [, setTick] = useState(0);
  useEffect(() => subscribe(() => setTick((n) => n + 1)), []);
};
