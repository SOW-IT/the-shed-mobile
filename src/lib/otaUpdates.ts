import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

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
 * Updates the app the quickest way there is: an over-the-air update for this
 * build if one is waiting, installed and restarted into straight away, or
 * else the store, for a version that needs a new build.
 */
export const updateApp = async (openStore: () => void): Promise<void> => {
  if (otaUpdates) {
    try {
      const { isAvailable } = await otaUpdates.checkForUpdateAsync();
      if (isAvailable) {
        await otaUpdates.fetchUpdateAsync();
        await otaUpdates.reloadAsync();
        return;
      }
    } catch {
      // Offline, or the update server is down: the store still works.
    }
  }
  openStore();
};
