import { useMutation } from "convex/react";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { type Href, useRouter } from "expo-router";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
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

/**
 * Gets this phone's push token and saves it for the signed-in person. Only
 * the first try after signing in may show the permission prompt; later tries
 * just check, so a "no" isn't asked again every time the app opens.
 * Resolves to whether the phone is now registered.
 */
async function registerThisPhone(
  register: (args: { token: string }) => Promise<null>,
  askPermission: boolean
): Promise<boolean> {
  const projectId = (
    Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  )?.eas?.projectId;
  if (!projectId) return false;

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && askPermission) {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await register({ token });
  return true;
}

export const usePushRegistration = (opts?: {
  navigationReady?: boolean;
  /** The signed-in person's email (null when signed out). */
  signedInAs?: string | null;
}) => {
  const register = useMutation(api.push.register);
  const signedInAs = opts?.signedInAs ?? null;
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

  // Saving the token needs someone signed in, so this runs once someone is:
  // their first sign-in, a saved sign-in loading on launch, or signing in as
  // someone else (the phone then moves to them). Until it has worked (say
  // notifications were off), it tries again whenever the app comes back to
  // the front.
  useEffect(() => {
    if (!signedInAs || Platform.OS === "web" || !Device.isDevice) return;
    let registered = false;
    let running = false;
    let asked = false;
    const run = async () => {
      if (registered || running) return;
      running = true;
      try {
        registered = await registerThisPhone(register, !asked);
      } catch (e) {
        console.warn("Push registration failed:", e);
      } finally {
        asked = true;
        running = false;
      }
    };
    void run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void run();
    });
    return () => subscription.remove();
  }, [signedInAs, register]);
};
