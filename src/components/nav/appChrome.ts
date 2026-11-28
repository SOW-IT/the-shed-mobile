import { useSyncExternalStore } from "react";

/**
 * Screens that want the whole window (the mahjong table, while you play or
 * watch) ask the app to hide its own chrome: the sidebar on a wide window
 * and the navigation drawer. It comes back when the last of them lets go.
 */
let holders = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

export const subscribeAppChrome = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const appChromeHidden = () => holders > 0;

/** Hides the app's chrome until the returned function is called (calling it again does nothing). */
export const holdAppChrome = () => {
  holders += 1;
  changed();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    changed();
  };
};

/** Whether something on screen has asked for the app's chrome to go. */
export const useAppChromeHidden = () => useSyncExternalStore(subscribeAppChrome, appChromeHidden, appChromeHidden);
