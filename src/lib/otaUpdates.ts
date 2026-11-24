import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import type { OtaState } from "../../shared/appLinks";

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

/**
 * Restarts into the over-the-air update for this build, downloading it
 * first if it isn't on the phone yet. Never opens the store: that's a
 * separate prompt, for a version that needs a new build.
 */
export const restartIntoUpdate = async (pending: boolean): Promise<void> => {
  if (!otaUpdates) return;
  if (!pending) await otaUpdates.fetchUpdateAsync();
  await otaUpdates.reloadAsync();
};

const manifestVersion = (manifest: unknown): string | undefined => {
  const extra = (manifest as { extra?: { expoClient?: { version?: unknown } } } | undefined)?.extra;
  const version = extra?.expoClient?.version;
  return typeof version === "string" ? version : undefined;
};

/** The over-the-air update state, or null in a build without expo-updates. */
export const useOtaState: () => (OtaState & { pending: boolean }) | null = otaUpdates
  ? () => {
      const state = otaUpdates.useUpdates();
      const update = state.downloadedUpdate ?? state.availableUpdate;
      return {
        available: state.isUpdateAvailable || state.isUpdatePending,
        pending: state.isUpdatePending,
        version: manifestVersion(update?.manifest),
        checked: state.lastCheckForUpdateTimeSinceRestart !== undefined || state.checkError !== undefined,
      };
    }
  : () => null;
