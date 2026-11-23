import { useQuery } from "convex/react";
import { useState } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";
import { appLinkForScheme } from "../../shared/appLinks";
import { updatesModule } from "@/components/OtaRestartOnResume";
import { appScheme, appVersion } from "@/hooks/useReportAppVersion";
import { openExternalLink } from "@/lib/openExternalLink";

export const nativePlatform = (): "ios" | "android" | null =>
  Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;

type UpdatePhase = "idle" | "checking" | "downloading" | "restarting";

const PHASE_LABEL: Record<Exclude<UpdatePhase, "idle">, string> = {
  checking: "Checking…",
  downloading: "Downloading…",
  restarting: "Restarting…",
};

const UPDATE_FAILED = "Couldn't update. Check your connection and try again.";

const otaUpdates = () => (updatesModule?.isEnabled && !__DEV__ ? updatesModule : null);

export const useAppUpdate = () => {
  const platform = nativePlatform();
  const version = appVersion();
  const link = appLinkForScheme(appScheme());
  const storeUrl = platform === "ios" ? link.iosStore : platform === "android" ? link.androidStore : null;
  const status = useQuery(
    api.appInstalls.updateStatus,
    platform && version && storeUrl ? { platform, version } : "skip"
  );
  const check = storeUrl ? status : undefined;
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [error, setError] = useState<string | null>(null);

  const openStore = () => {
    if (storeUrl) void openExternalLink(storeUrl);
  };

  const update = async () => {
    if (phase !== "idle") return;
    setError(null);
    const updates = otaUpdates();
    if (!updates) {
      openStore();
      return;
    }
    try {
      setPhase("checking");
      const available = await updates.checkForUpdateAsync();
      if (available.isAvailable) {
        setPhase("downloading");
        await updates.fetchUpdateAsync();
        setPhase("restarting");
        await updates.reloadAsync();
        return;
      }
      setPhase("idle");
      openStore();
    } catch {
      setPhase("idle");
      setError(UPDATE_FAILED);
    }
  };

  return {
    check,
    version,
    behind: check?.status === "recommended" || check?.status === "required",
    busy: phase !== "idle",
    label: phase === "idle" ? null : PHASE_LABEL[phase],
    error,
    update: () => void update(),
  };
};
