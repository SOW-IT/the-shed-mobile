// A value the games keep on the phone (bests, the score queue, character
// choices), loaded once and saved after each change.
import { readStored, tryWriteStored } from "../deviceStorage";

/**
 * A saved value that loads before any change is made to it, so a run
 * finished while the phone is still reading the saved best can't overwrite
 * it.
 */
export const persisted = <T>(
  key: string,
  parse: (saved: string) => T,
  initial: T,
  stringify: (value: T) => string = JSON.stringify
) => {
  let value = initial;
  let loading: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const load = () =>
    (loading ??= readStored(key).then((saved) => {
      if (saved === null) return;
      value = parse(saved);
      notify();
    }));
  // A write that failed stays owed, so the next change saves it even when
  // that change leaves the value as it was.
  let unsaved = false;
  // Writes go one at a time, each saving the value as it is when its turn
  // comes, so a slow earlier write can't finish last and mark a newer value
  // that failed to save as saved.
  let writing: Promise<void> = Promise.resolve();
  const save = () =>
    (writing = writing.then(async () => {
      unsaved = !(await tryWriteStored(key, stringify(value)));
    }));
  const update = async (change: (current: T) => T) => {
    await load();
    const next = change(value);
    if (next === value && !unsaved) return;
    if (next !== value) {
      value = next;
      notify();
    }
    await save();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  };
  return { get: () => value, update, subscribe };
};
