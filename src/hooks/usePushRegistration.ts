import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { consumeNotificationDeepLink } from "../../shared/deepLinks";
import { api } from "../../convex/_generated/api";

// Show flow notifications even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Survives React remounts (auth gate / tabs role gate). Without this, every
// remount re-reads getLastNotificationResponse and pushes the same URL again.
const handledNotificationIds = new Set<string>();

/**
 * Registers this device's Expo push token against the signed-in user so the
 * backend can notify them about request updates. No-ops on web, simulators,
 * and until the repo is linked to an EAS project (`npx eas init`).
 *
 * `navigationReady` should be false while the tabs layout is still waiting on
 * `me` (SowSpinner gate) — navigating then remounts the navigator and used to
 * replay the sticky last-notification response forever.
 */
export const usePushRegistration = (opts?: { navigationReady?: boolean }) => {
  const register = useMutation(api.push.register);
  const router = useRouter();
  const navigationReady = opts?.navigationReady ?? true;

  // Deep links: tapping a notification opens the route in its data payload
  // (e.g. /?tab=review or /request/<id>), including from a cold start.
  useEffect(() => {
    if (Platform.OS === "web" || !navigationReady) return;

    const openFrom = (response: Notifications.NotificationResponse | null) => {
      const url = consumeNotificationDeepLink(response, handledNotificationIds);
      // Always clear once we've seen a response — even if the URL was missing
      // or rejected — so a sticky last-response can't remount-loop.
      if (response) {
        Notifications.clearLastNotificationResponse();
      }
      if (url) {
        router.push(url as Href);
      }
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(openFrom);
    void Notifications.getLastNotificationResponseAsync().then(openFrom);
    return () => subscription.remove();
  }, [router, navigationReady]);

  useEffect(() => {
    const run = async () => {
      if (Platform.OS === "web" || !Device.isDevice) return;
      const projectId = (
        Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
      )?.eas?.projectId;
      if (!projectId) return;

      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") {
        status = (await Notifications.requestPermissionsAsync()).status;
      }
      if (status !== "granted") return;

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await register({ token });
    };
    run().catch((e) => console.warn("Push registration failed:", e));
  }, [register]);
};
