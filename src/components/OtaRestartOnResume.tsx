import { requireOptionalNativeModule } from "expo";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { readyToRestart } from "@/lib/restartHold";

type UpdatesModule = typeof import("expo-updates");

const loadUpdates = (): UpdatesModule | null => {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoUpdates")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-updates") as UpdatesModule;
};

const updatesModule = loadUpdates();

export function OtaRestartOnResume() {
  return updatesModule?.isEnabled ? <RestartWhenResumed updates={updatesModule} /> : null;
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
