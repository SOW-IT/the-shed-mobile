import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { makeRedirectUri } from "expo-auth-session";
import { openAuthSessionAsync } from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { radius, spacing, typography, useAppTheme } from "../theme";
import { ErrorBanner, errorMessage, FadeInView, SowSpinner } from "./ui";

export const SignInScreen = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // On web, Google redirects back to the app with ?code=XXX. ConvexAuthProvider
  // doesn't auto-exchange the code in Expo's web context, so we do it here.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    // Remove code from URL so a page refresh doesn't re-attempt a used code.
    window.history.replaceState({}, "", window.location.pathname);
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
      const redirectTo = makeRedirectUri();
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
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <View style={[styles.fullScreen, { backgroundColor: t.background }]}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.hero}>
          <FadeInView style={styles.heroInner}>
            <SowSpinner size={96} />
            <Image
              source={
                t.dark
                  ? require("../../assets/images/lockup-cream.png")
                  : require("../../assets/images/lockup-dark.png")
              }
              style={styles.lockup}
              resizeMode="contain"
            />
            <Text style={[styles.title, { color: t.text }]}>THE SHED</Text>
          </FadeInView>
        </View>
        <FadeInView delay={120}>
          <Animated.View style={[{ transform: [{ scale }] }, styles.buttonWrap]}>
            <Pressable
              onPress={() => void handleSignIn()}
              onPressIn={() =>
                Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
              }
              onPressOut={() =>
                Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start()
              }
              disabled={busy}
              style={[
                styles.googleButton,
                { backgroundColor: t.primary },
                busy && { opacity: 0.6 },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={t.onPrimary} />
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
  lockup: { width: 280, height: 53, marginBottom: spacing.md },
  title: { fontSize: 34, fontWeight: "900", letterSpacing: 2 },
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
