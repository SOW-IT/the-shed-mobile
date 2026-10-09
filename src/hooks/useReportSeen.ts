import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";

/** As often as the server records it (see SEEN_WRITE_INTERVAL_MS). */
const SEEN_PING_MS = 5 * 60_000;

/**
 * Tells the server the signed-in person has The SHED open, for "Last online"
 * on their profile: when it opens, whenever it comes back to the front, and
 * every few minutes while it's in use. A web tab in the background counts as
 * away, like an app in the background.
 */
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
