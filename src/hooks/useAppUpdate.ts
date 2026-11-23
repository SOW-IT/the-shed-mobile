import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import { appLinkForScheme, updateRouteFor } from "../../shared/appLinks";
import { appScheme, appVersion } from "@/hooks/useReportAppVersion";
import { openExternalLink } from "@/lib/openExternalLink";
import { checkForUpdateOnce, restartIntoUpdate, useOtaState } from "@/lib/otaUpdates";

const nativePlatform = (): "ios" | "android" | null =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

const storeName = (platform: "ios" | "android" | null) => (platform === "android" ? "Play Store" : "App Store");

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
  const [restarting, setRestarting] = useState(false);
  const [failed, setFailed] = useState(false);
  const status = storeUrl ? check?.status : undefined;
  const behind = status === "recommended" || status === "required";
  const route = behind ? updateRouteFor(check?.latest ?? null, ota) : null;
  const waiting = route === "wait" && ota !== null && !ota.busy && !ota.checked;
  useEffect(() => {
    if (waiting) checkForUpdateOnce();
  }, [waiting]);
  const restart = () => {
    if (restarting || !ota) return;
    setRestarting(true);
    setFailed(false);
    restartIntoUpdate(ota.pending).catch(() => {
      setRestarting(false);
      setFailed(true);
    });
  };
  const openStore = () => {
    if (storeUrl) void openExternalLink(storeUrl);
  };
  return {
    status,
    route,
    latest: check?.latest ?? null,
    message: check?.message ?? null,
    version,
    store: storeName(platform),
    restart,
    restarting,
    failed,
    openStore,
  };
};
