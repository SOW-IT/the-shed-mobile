import { useConvexAuth, useMutation } from "convex/react";
import Constants from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";

/** The version of the app on this phone (the web is always the latest). */
export const appVersion = (): string | undefined => Constants.expoConfig?.version ?? undefined;

/**
 * Tells the server which version of the app this phone has, once signed in,
 * so emailed links to pages added since can open here (and links to pages an
 * older app lacks stay on the web for people who haven't updated).
 */
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
