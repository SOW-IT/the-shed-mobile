import { requireOptionalNativeModule } from "expo";
import { AppState, Platform } from "react-native";
import type { OtaState } from "../../shared/appLinks";
import type { UpdateDriver } from "@/lib/otaUpdateButton";

type UpdatesModule = typeof import("expo-updates");

const loadUpdates = (): UpdatesModule | null => {
  if (Platform.OS === "web" || !requireOptionalNativeModule("ExpoUpdates")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when the native module exists, so web and builds without expo-updates never import it
  return require("expo-updates") as UpdatesModule;
};

/** expo-updates when this build has it switched on, otherwise null. */
export const otaUpdates: UpdatesModule | null = (() => {
  const updates = loadUpdates();
  return updates?.isEnabled ? updates : null;
})();

const driverFor = (updates: UpdatesModule): UpdateDriver => ({
  fetch: async () => {
    const result = await updates.fetchUpdateAsync();
    return result.isNew || result.isRollBackToEmbedded;
  },
  reload: () => updates.reloadAsync(),
  isActive: () => AppState.currentState === "active",
});

export const otaUpdateDriver: UpdateDriver | null = otaUpdates ? driverFor(otaUpdates) : null;

const manifestVersion = (manifest: unknown): string | undefined => {
  const extra = (manifest as { extra?: { expoClient?: { version?: unknown } } } | undefined)?.extra;
  const version = extra?.expoClient?.version;
  return typeof version === "string" ? version : undefined;
};

/** The over-the-air update state, or null in a build without expo-updates. */
export const useOtaState: () => (OtaState & { pending: boolean; downloading: boolean }) | null = otaUpdates
  ? () => {
      const state = otaUpdates.useUpdates();
      const update = state.downloadedUpdate ?? state.availableUpdate;
      return {
        available: state.isUpdateAvailable || state.isUpdatePending,
        pending: state.isUpdatePending,
        downloading: state.isDownloading,
        version: manifestVersion(update?.manifest),
        checked: state.lastCheckForUpdateTimeSinceRestart !== undefined || state.checkError !== undefined,
        answeredAt:
          state.checkError === undefined ? (state.lastCheckForUpdateTimeSinceRestart?.getTime() ?? null) : null,
        inFlight:
          state.isDownloading || state.isStartupProcedureRunning ? "download" : state.isChecking ? "check" : null,
      };
    }
  : () => null;
