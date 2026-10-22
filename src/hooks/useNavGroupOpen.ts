import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { NavGroupKey } from "@/lib/navMenu";

const STORAGE_KEY = "navGroupsOpen";

const onWeb = () => Platform.OS === "web" && typeof window !== "undefined";

let openGroups: Partial<Record<NavGroupKey, boolean>> = {};
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

const write = (value: string) => {
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
    if (changedBeforeLoad || !saved) return;
    try {
      openGroups = { ...JSON.parse(saved), ...openGroups };
      notify();
    } catch {
      return;
    }
  });
};

const setGroupOpen = (key: NavGroupKey, open: boolean) => {
  if (openGroups[key] === open) return;
  if (loadState !== "done") changedBeforeLoad = true;
  openGroups = { ...openGroups, [key]: open };
  write(JSON.stringify(openGroups));
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
};

export const useNavGroupOpen = (key: NavGroupKey, containsActive: boolean) => {
  const isOpen = useCallback(() => openGroups[key] ?? false, [key]);
  const open = useSyncExternalStore(subscribe, isOpen, isOpen);
  useEffect(() => {
    if (containsActive) setGroupOpen(key, true);
  }, [containsActive, key]);
  const toggle = useCallback(() => setGroupOpen(key, !(openGroups[key] ?? false)), [key]);
  return [open, toggle] as const;
};
