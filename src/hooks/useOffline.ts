import { useConvex } from "convex/react";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

/** Reconnects this quick don't count as being offline. */
const GRACE_MS = 4000;

const browserOffline = () =>
  Platform.OS === "web" && typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Whether the app has lost its connection to the backend: the browser says
 * it's offline, or the connection has been down for a few seconds. The app
 * has no network library, and the backend connection is what matters to it.
 */
export const useOffline = (): boolean => {
  const convex = useConvex();
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const update = () => {
      const connected = convex.connectionState().isWebSocketConnected;
      if (browserOffline()) {
        stopTimer();
        setOffline(true);
      } else if (connected) {
        stopTimer();
        setOffline(false);
      } else {
        timer ??= setTimeout(() => setOffline(true), GRACE_MS);
      }
    };
    update();
    const unsubscribe = convex.subscribeToConnectionState(update);
    const web = Platform.OS === "web" && typeof window !== "undefined";
    if (web) {
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
    }
    return () => {
      stopTimer();
      unsubscribe();
      if (web) {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      }
    };
  }, [convex]);
  return offline;
};
