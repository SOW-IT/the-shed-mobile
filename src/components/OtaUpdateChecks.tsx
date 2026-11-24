import { useEffect } from "react";
import { AppState } from "react-native";
import { otaUpdates } from "@/lib/otaUpdates";
import { CHECK_TICK_MS, checkDue, latestOf } from "@/lib/otaUpdateButton";

type UpdatesModule = typeof import("expo-updates");

let askedAt: number | null = null;

export function OtaUpdateChecks() {
  return otaUpdates ? <CheckWhileOpen updates={otaUpdates} /> : null;
}

function CheckWhileOpen({
  updates,
}: {
  updates: Pick<UpdatesModule, "useUpdates" | "checkForUpdateAsync">;
}) {
  const state = updates.useUpdates();
  const settled =
    !state.isStartupProcedureRunning &&
    !state.isChecking &&
    !state.isDownloading &&
    !state.isRestarting &&
    !state.isUpdateAvailable &&
    !state.isUpdatePending;
  const lastCheckedAt = state.lastCheckForUpdateTimeSinceRestart?.getTime() ?? null;
  useEffect(() => {
    if (!settled) return;
    const checkIfDue = () => {
      if (AppState.currentState === "background") return;
      const now = Date.now();
      if (!checkDue(latestOf(askedAt, lastCheckedAt), now)) return;
      askedAt = now;
      updates.checkForUpdateAsync().catch(() => undefined);
    };
    checkIfDue();
    const timer = setInterval(checkIfDue, CHECK_TICK_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") checkIfDue();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [settled, lastCheckedAt, updates]);
  return null;
}
