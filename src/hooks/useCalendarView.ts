import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

export type CalendarView = "month" | "week";

const STORAGE_KEY = "calendarView";

const onWeb = () => Platform.OS === "web" && typeof window !== "undefined";

let view: CalendarView = "month";
let loadState: "idle" | "loading" | "done" = "idle";
let changedBeforeLoad = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

const read = async (): Promise<string | null> => {
  try {
    return onWeb() ? window.localStorage.getItem(STORAGE_KEY) : await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
};

const write = (value: CalendarView) => {
  try {
    if (onWeb()) window.localStorage.setItem(STORAGE_KEY, value);
    else void SecureStore.setItemAsync(STORAGE_KEY, value).catch(() => {});
  } catch {
    return;
  }
};

const load = () => {
  if (loadState !== "idle") return;
  loadState = "loading";
  void read().then((saved) => {
    loadState = "done";
    if (changedBeforeLoad || (saved !== "month" && saved !== "week")) return;
    view = saved;
    notify();
  });
};

// Picking the view it's already on still counts, so a link to Month beats a saved Week.
const setView = (next: CalendarView) => {
  if (loadState !== "done") changedBeforeLoad = true;
  write(next);
  if (view === next) return;
  view = next;
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
};

const current = () => view;

// Month or Week, remembered on this phone or browser.
export const useCalendarView = () => [useSyncExternalStore(subscribe, current, current), setView] as const;
