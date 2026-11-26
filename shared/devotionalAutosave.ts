export const DEVOTIONAL_AUTOSAVE_DELAY_MS = 500;

export const createDevotionalAutosave = <T>(options: {
  writeLocal: (edit: T) => Promise<unknown>;
  delayMs?: number;
}) => {
  const delayMs = options.delayMs ?? DEVOTIONAL_AUTOSAVE_DELAY_MS;
  let pending: { edit: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();

  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const flushLocal = (): Promise<void> => {
    stopTimer();
    const next = pending;
    pending = null;
    if (next) {
      writing = writing.then(
        () => options.writeLocal(next.edit).then(
          () => undefined,
          () => undefined
        )
      );
    }
    return writing;
  };

  const edit = (latest: T) => {
    pending = { edit: latest };
    stopTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void flushLocal();
    }, delayMs);
  };

  const cancel = () => {
    stopTimer();
    pending = null;
  };

  return { edit, flushLocal, cancel };
};

export const devotionalSyncHoldKey = (email: string, date: string) => `${email.trim().toLowerCase()}/${date}`;

export const createDevotionalSyncHolds = () => {
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let held: ReadonlySet<string> = new Set();

  const publish = () => {
    held = new Set(counts.keys());
    for (const listener of listeners) listener();
  };

  const hold = (key: string) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    publish();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (counts.get(key) ?? 1) - 1;
      if (left > 0) counts.set(key, left);
      else counts.delete(key);
      publish();
    };
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { hold, held: () => held, subscribe };
};
