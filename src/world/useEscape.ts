import { useEffect } from "react";
import { Platform } from "react-native";

/** On the web, Escape calls `onEscape` (closing a popup or a dialog); elsewhere it does nothing. */
export const useEscape = (onEscape: () => void) => {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);
};
