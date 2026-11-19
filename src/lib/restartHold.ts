export const MIN_AWAY_BEFORE_RESTART_MS = 10 * 60_000;

let holds = 0;

export const restartHeld = (): boolean => holds > 0;

export function holdRestart(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
  };
}

export async function withRestartHeld<T>(task: () => Promise<T>): Promise<T> {
  const release = holdRestart();
  try {
    return await task();
  } finally {
    release();
  }
}

export const readyToRestart = (leftAt: number | null, now: number): boolean =>
  leftAt !== null && now - leftAt >= MIN_AWAY_BEFORE_RESTART_MS && !restartHeld();
