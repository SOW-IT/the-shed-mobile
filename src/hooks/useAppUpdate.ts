import { useQuery } from "convex/react";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import { appLinkForScheme, updateRouteFor } from "../../shared/appLinks";
import { appScheme, appVersion } from "@/hooks/useReportAppVersion";
import { openExternalLink } from "@/lib/openExternalLink";
import { restartIntoUpdate, useOtaState } from "@/lib/otaUpdates";
import {
  previewFromSearch,
  runUpdate,
  startPreview,
  subscribeUpdatePhase,
  updateButtonFor,
  updatePhase,
} from "@/lib/otaUpdateButton";

const nativePlatform = (): "ios" | "android" | null =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

const storeName = (platform: "ios" | "android" | null) => (platform === "android" ? "Play Store" : "App Store");

const PREVIEW_FAIL_AFTER_MS = 1500;

const preview = __DEV__ ? previewFromSearch(globalThis.location?.search) : null;
startPreview(preview);

const previewRestart = () =>
  new Promise<void>((_, reject) => setTimeout(() => reject(new Error("preview")), PREVIEW_FAIL_AFTER_MS));

export const useAppUpdate = () => {
  const platform = nativePlatform();
  const version = appVersion();
  const link = appLinkForScheme(appScheme());
  const storeUrl = platform === "ios" ? link.iosStore : platform === "android" ? link.androidStore : null;
  const check = useQuery(
    api.appInstalls.updateStatus,
    platform && version && storeUrl ? { platform, version } : "skip"
  );
  const ota = useOtaState();
  const phase = useSyncExternalStore(subscribeUpdatePhase, updatePhase, updatePhase);
  const status = storeUrl ? check?.status : undefined;
  const latest = check?.latest ?? null;
  const behind = status === "recommended" || status === "required";
  const route = behind ? updateRouteFor(latest, ota) : null;
  const button =
    preview?.kind ?? updateButtonFor({ dev: __DEV__, web: Platform.OS === "web", ota, status, latest });
  const restart = () => runUpdate(preview ? previewRestart : () => restartIntoUpdate(ota?.pending ?? false));
  const openStore = () => {
    if (storeUrl) void openExternalLink(storeUrl);
  };
  return {
    status,
    route,
    button,
    latest,
    message: check?.message ?? null,
    version,
    platform,
    store: storeName(platform),
    restart,
    restarting: phase === "updating",
    failed: phase === "failed",
    openStore,
  };
};
