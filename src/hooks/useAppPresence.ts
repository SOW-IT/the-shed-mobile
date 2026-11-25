import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { AppState } from "react-native";
import { APP_PING_MS } from "@shared/appPresence";
import { api } from "../../convex/_generated/api";

export const useAppPresence = () => {
  const { isAuthenticated } = useConvexAuth();
  const heartbeat = useMutation(api.presence.appHeartbeat);
  const away = useMutation(api.presence.appAway);
  useEffect(() => {
    if (!isAuthenticated) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const ping = () => void heartbeat({}).catch(() => {});
    const stop = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };
    const start = () => {
      if (interval !== null) return;
      ping();
      interval = setInterval(ping, APP_PING_MS);
    };
    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") return start();
      if (state !== "background" || interval === null) return;
      stop();
      void away({}).catch(() => {});
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [isAuthenticated, heartbeat, away]);
};
