export const MIN_AWAY_BEFORE_RESTART_MS = 10 * 60_000;

let holds = 0;

export const restartHeld = (): boolean => holds > 0;

export async function withRestartHeld<T>(task: () => Promise<T>): Promise<T> {
  holds += 1;
  try {
    return await task();
  } finally {
    holds -= 1;
  }
}

export const readyToRestart = (leftAt: number | null, now: number): boolean =>
  leftAt !== null && now - leftAt >= MIN_AWAY_BEFORE_RESTART_MS && !restartHeld();
