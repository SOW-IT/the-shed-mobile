import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const onWeb = () => Platform.OS === "web" && typeof window !== "undefined";

export const readStored = async (key: string): Promise<string | null> => {
  try {
    return onWeb() ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};

export const writeStored = async (key: string, value: string): Promise<void> => {
  try {
    if (onWeb()) window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    return;
  }
};

export const removeStored = async (key: string): Promise<void> => {
  try {
    if (onWeb()) window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    return;
  }
};

export const storedValue = <T>({
  key,
  initial,
  restore,
  serialize,
}: {
  key: string;
  initial: T;
  restore: (saved: string, current: T) => T | null;
  serialize: (value: T) => string;
}) => {
  let value = initial;
  let loadState: "idle" | "loading" | "done" = "idle";
  let changedBeforeLoad = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const load = () => {
    if (loadState !== "idle") return;
    loadState = "loading";
    void readStored(key).then((saved) => {
      loadState = "done";
      if (changedBeforeLoad || saved === null) return;
      const restored = restore(saved, value);
      if (restored === null) return;
      value = restored;
      notify();
    });
  };

  const set = (next: T) => {
    if (loadState !== "done") changedBeforeLoad = true;
    void writeStored(key, serialize(next));
    if (Object.is(value, next)) return;
    value = next;
    notify();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    load();
    return () => {
      listeners.delete(listener);
    };
  };

  return { get: () => value, set, subscribe };
};
