import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { consumeNotificationDeepLink } from "../../shared/deepLinks";
import { api } from "../../convex/_generated/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const handledNotificationIds = new Set<string>();

export const usePushRegistration = (opts?: { navigationReady?: boolean }) => {
  const register = useMutation(api.push.register);
  const router = useRouter();
  const navigationReady = opts?.navigationReady ?? true;

  useEffect(() => {
    if (Platform.OS === "web" || !navigationReady) return;

    const openFrom = (response: Notifications.NotificationResponse | null) => {
      const url = consumeNotificationDeepLink(response, handledNotificationIds);
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
