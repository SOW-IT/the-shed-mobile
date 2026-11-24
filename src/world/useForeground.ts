import { useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";

const isDocumentVisible = () =>
  Platform.OS !== "web" || typeof document === "undefined" || !document.hidden;

export const isAppActive = () =>
  AppState.currentState === "active" && isDocumentVisible();

export const subscribeForeground = (onChange: (active: boolean) => void) => {
  let current = isAppActive();
  const update = () => {
    const next = isAppActive();
    if (next === current) return;
    current = next;
    onChange(next);
  };
  const appSub = AppState.addEventListener("change", update);
  if (Platform.OS === "web" && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", update);
    return () => {
      appSub.remove();
      document.removeEventListener("visibilitychange", update);
    };
  }
  return () => {
    appSub.remove();
  };
};

const subscribeStore = (onStoreChange: () => void) =>
  subscribeForeground(() => onStoreChange());

export const useForeground = () =>
  useSyncExternalStore(subscribeStore, isAppActive, () => true);
