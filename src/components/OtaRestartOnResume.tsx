import { useEffect } from "react";
import { AppState } from "react-native";
import { otaUpdates } from "@/lib/otaUpdates";
import { readyToRestart } from "@/lib/restartHold";

type UpdatesModule = typeof import("expo-updates");

export function OtaRestartOnResume() {
  return otaUpdates ? <RestartWhenResumed updates={otaUpdates} /> : null;
}

function RestartWhenResumed({
  updates,
}: {
  updates: Pick<UpdatesModule, "useUpdates" | "reloadAsync">;
}) {
  const { isUpdatePending } = updates.useUpdates();
  useEffect(() => {
    if (!isUpdatePending) return;
    let leftAt = AppState.currentState === "background" ? Date.now() : null;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        leftAt ??= Date.now();
      } else if (state === "active") {
        const ready = readyToRestart(leftAt, Date.now());
        leftAt = null;
        if (ready) void updates.reloadAsync().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [isUpdatePending, updates]);
  return null;
}
