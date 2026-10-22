import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";

const SEEN_PING_MS = 5 * 60_000;

export const useReportSeen = () => {
  const { isAuthenticated } = useConvexAuth();
  const markSeen = useMutation(api.presence.markSeen);
  useEffect(() => {
    if (!isAuthenticated) return;
    const ping = () => {
      if (AppState.currentState === "active") void markSeen({}).catch(() => {});
    };
    ping();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") ping();
    });
    const interval = setInterval(ping, SEEN_PING_MS);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [isAuthenticated, markSeen]);
};
