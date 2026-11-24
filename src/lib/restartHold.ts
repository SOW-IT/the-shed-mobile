let holds = 0;
const freeListeners = new Set<() => void>();

export const restartHeld = (): boolean => holds > 0;

export function holdRestart(): () => void {
  holds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) [...freeListeners].forEach((listener) => listener());
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

export function onRestartFree(listener: () => void): () => void {
  freeListeners.add(listener);
  return () => {
    freeListeners.delete(listener);
  };
}
