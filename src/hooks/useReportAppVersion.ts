import { useConvexAuth, useMutation } from "convex/react";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";

export const appVersion = (): string | undefined => Constants.expoConfig?.version ?? undefined;

export const useReportAppVersion = () => {
  const { isAuthenticated } = useConvexAuth();
  const report = useMutation(api.appInstalls.report);
  useEffect(() => {
    const version = appVersion();
    if (!isAuthenticated || !version || (Platform.OS !== "ios" && Platform.OS !== "android")) {
      return;
    }
    void report({ platform: Platform.OS, version }).catch(() => {});
  }, [isAuthenticated, report]);
};
