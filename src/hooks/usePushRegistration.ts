import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
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

/**
 * Registers this device's Expo push token against the signed-in user so the
 * backend can notify them about request updates. No-ops on web, simulators,
 * and until the repo is linked to an EAS project (`npx eas init`).
 */
export const usePushRegistration = () => {
  const register = useMutation(api.push.register);
  const router = useRouter();

  // Deep links: tapping a notification opens the route in its data payload
  // (e.g. /review or /request/<id>), including from a cold start.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const openFrom = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === "string" && url.startsWith("/")) {
        router.push(url as never);
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openFrom);
    void Notifications.getLastNotificationResponseAsync().then(openFrom);
    return () => subscription.remove();
  }, [router]);

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
