import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import Constants from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, spacing, USE_NATIVE_DRIVER, useAppTheme } from "../theme";
import { ErrorBanner, errorMessage, FadeInView, SowSpinner } from "./ui";

export const SignInScreen = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  // On web, signing in is a full-page redirect to Google, so coming back
  // re-mounts this screen with ?code=XXX in the URL. Start in the busy state
  // when that param is present so the button is disabled/loading from the very
  // first render through the code exchange below — the user can't re-tap it
  // while we're actually signing them in.
  const [busy, setBusy] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("code")
  );

  // On web, Google redirects back to the app with ?code=XXX. ConvexAuthProvider
  // doesn't auto-exchange the code in Expo's web context, so we do it here.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Remove code from URL so a page refresh doesn't re-attempt a used code.
    window.history.replaceState({}, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- OAuth code exchange on load
    setBusy(true);
    void signIn("google", { code })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, [signIn]);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        // Come back to wherever this app is served from (hosted site,
        // local dev, static preview) instead of defaulting to SITE_URL.
        await signIn("google", { redirectTo: window.location.origin });
        return; // full-page redirect to Google
      }
      // Pass the scheme explicitly so the staging build always produces
      // theshedmobilestaging:// rather than exp://localhost when run via
      // Expo Go or a dev client against the staging Convex deployment.
      const scheme = Constants.expoConfig?.scheme ?? "theshedmobile";
      const redirectTo = makeRedirectUri({ scheme: Array.isArray(scheme) ? scheme[0] : scheme });
      const { redirect } = await signIn("google", { redirectTo });
      if (redirect) {
        const result = await openAuthSessionAsync(redirect.toString(), redirectTo);
        if (result.type === "success") {
          const code = new URL(result.url).searchParams.get("code");
          if (code) await signIn("google", { code });
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const t = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));

  return (
    <View style={[styles.fullScreen, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.hero}>
          <FadeInView style={styles.heroInner}>
            <Image
              source={
                t.dark
                  ? require("../../assets/images/mark-cream.png")
                  : require("../../assets/images/mark-dark.png")
              }
              style={styles.mark}
              resizeMode="contain"
            />
            <Image
              source={require("../../assets/images/the-shed-watermark.png")}
              style={[styles.watermark, { tintColor: t.text }]}
              resizeMode="contain"
            />
          </FadeInView>
        </View>
        <FadeInView delay={120}>
          <Animated.View style={[{ transform: [{ scale }] }, styles.buttonWrap]}>
            <Pressable
              onPress={() => void handleSignIn()}
              onPressIn={() =>
                Animated.spring(scale, { toValue: 0.97, useNativeDriver: USE_NATIVE_DRIVER, speed: 50, bounciness: 0 }).start()
              }
              onPressOut={() =>
                Animated.spring(scale, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 20, bounciness: 6 }).start()
              }
              disabled={busy}
              style={[
                styles.googleButton,
                { backgroundColor: t.primary },
                busy && { opacity: 0.6 },
              ]}
            >
              {busy ? (
                <SowSpinner size={20} onDark={!t.dark} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={t.onPrimary} />
                  <Text style={[styles.googleButtonText, { color: t.onPrimary }]}>
                    Sign in with Google
                  </Text>
                </>
              )}
            </Pressable>
          </Animated.View>
          <ErrorBanner message={error} />
        </FadeInView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
  },
  screen: {
    flex: 1,
    padding: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    justifyContent: "center",
    gap: spacing.xl,
  },
  hero: { alignItems: "center" },
  heroInner: { alignItems: "center", gap: spacing.sm },
  mark: { width: 90, height: 90 },
  watermark: { width: 300, height: 205 },
  tagline: { textAlign: "center", maxWidth: 280, lineHeight: 19 },
  buttonWrap: { maxWidth: 420, width: "100%", alignSelf: "center" },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 54,
    borderRadius: radius.lg - 2,
  },
  googleButtonText: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
});
