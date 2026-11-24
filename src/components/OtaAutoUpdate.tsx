import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { otaUpdateDriver, otaUpdates } from "@/lib/otaUpdates";
import {
  behindSnapshot,
  CHECK_TICK_MS,
  checkDue,
  downloadUpdate,
  freshCheckDue,
  latestOf,
  restartWhenFree,
  subscribeBehind,
  type UpdateDriver,
} from "@/lib/otaUpdateButton";

type UpdatesModule = typeof import("expo-updates");

let askedAt: number | null = null;
let fetchedOnce: string | null = null;

export function OtaAutoUpdate() {
  return otaUpdates && otaUpdateDriver ? <AutoUpdate updates={otaUpdates} driver={otaUpdateDriver} /> : null;
}

function AutoUpdate({
  updates,
  driver,
}: {
  updates: Pick<UpdatesModule, "useUpdates" | "checkForUpdateAsync">;
  driver: UpdateDriver;
}) {
  const state = updates.useUpdates();
  const quiet =
    !state.isStartupProcedureRunning && !state.isChecking && !state.isDownloading && !state.isRestarting;
  const found = state.isUpdateAvailable && !state.isUpdatePending;
  const foundId = found ? (state.availableUpdate?.updateId ?? "rollback") : null;
  const downloaded = state.isUpdatePending;
  const lastCheckedAt = state.lastCheckForUpdateTimeSinceRestart?.getTime() ?? null;
  const behindSeen = useSyncExternalStore(subscribeBehind, behindSnapshot, behindSnapshot);

  useEffect(() => {
    if (!quiet || found || !freshCheckDue(behindSeen, askedAt, lastCheckedAt)) return;
    askedAt = Date.now();
    updates.checkForUpdateAsync().catch(() => undefined);
  }, [quiet, found, behindSeen, lastCheckedAt, updates]);

  useEffect(() => {
    if (!quiet || !foundId || fetchedOnce === foundId) return;
    fetchedOnce = foundId;
    downloadUpdate(driver);
  }, [quiet, foundId, driver]);

  useEffect(() => {
    if (!downloaded) return;
    restartWhenFree(driver);
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") restartWhenFree(driver);
    });
    return () => subscription.remove();
  }, [downloaded, driver]);

  useEffect(() => {
    if (!quiet || downloaded) return;
    const checkIfDue = () => {
      if (AppState.currentState === "background") return;
      const now = Date.now();
      if (!checkDue(latestOf(askedAt, lastCheckedAt), now)) return;
      askedAt = now;
      if (found) downloadUpdate(driver);
      else updates.checkForUpdateAsync().catch(() => undefined);
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
  }, [quiet, downloaded, found, lastCheckedAt, updates, driver]);

  return null;
}
