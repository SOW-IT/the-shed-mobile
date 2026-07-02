import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import Constants from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
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

// Dismiss any auth session left dangling by a previous redirect so the next one
// resolves cleanly (recommended for redirect-based auth; no-op on native at
// import time, relevant for the web popup flow).
maybeCompleteAuthSession();

// How long to wait for the OAuth `code` to arrive as a deep link after the auth
// session ends without one. Covers the cold-iOS-session case where the session
// reports dismiss/cancel a moment before the OS delivers the redirect deep link.
const REDIRECT_GRACE_MS = 2500;

/** Pull the OAuth `code` from a redirect URL. `Linking.parse` understands the
 *  app's custom scheme (theshedmobile://…) more reliably than the URL polyfill,
 *  with `new URL` as a fallback for https redirects. */
const codeFromUrl = (url: string): string | null => {
  const fromExpo = Linking.parse(url).queryParams?.code;
  if (typeof fromExpo === "string") return fromExpo;
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
};

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
      // Truthy check (not just .has) to match the effect below — an empty
      // ?code= would otherwise start busy but be skipped by the effect,
      // leaving the button stuck disabled.
      !!new URLSearchParams(window.location.search).get("code")
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
    // Stay busy through the exchange: on success the app flips to Authenticated
    // and this screen unmounts, so only re-enable the button if it fails.
    void signIn("google", { code }).catch((e: unknown) => {
      setError(errorMessage(e));
      setBusy(false);
    });
  }, [signIn]);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        // Full-page redirect to Google (back to wherever this app is served
        // from). Stay busy — we're navigating away, and resetting would briefly
        // re-enable the button before the redirect actually happens.
        await signIn("google", { redirectTo: window.location.origin });
        return;
      }
      // Pass the scheme explicitly so the staging build always produces
      // theshedmobilestaging:// rather than exp://localhost when run via
      // Expo Go or a dev client against the staging Convex deployment.
      const scheme = Constants.expoConfig?.scheme ?? "theshedmobile";
      const redirectTo = makeRedirectUri({ scheme: Array.isArray(scheme) ? scheme[0] : scheme });
      const { redirect } = await signIn("google", { redirectTo });
      if (!redirect) {
        setBusy(false);
        return;
      }
      // Capture the OAuth redirect from whichever source delivers it first: the
      // auth-session result, or a deep-link event. On a fresh install the first
      // iOS ASWebAuthenticationSession can resolve as "dismiss"/"cancel" even
      // though the redirect actually fired (cold session + the one-time consent
      // prompt) — that dropped the code and left the user un-signed-in until a
      // second attempt warmed the session. When the session fails to swallow the
      // redirect, the OS hands theshedmobile://…?code= to the app as a normal
      // deep link, so this Linking listener recovers it on that first try.
      const outcome = await new Promise<{ url: string | null; error?: unknown }>(
        (resolve) => {
          let settled = false;
          let graceTimer: ReturnType<typeof setTimeout> | null = null;
          // Captured if the auth session *rejects* (an unexpected runtime/env
          // error, NOT a user cancel/dismiss — those resolve). Surfaced only if
          // the grace window also yields no code.
          let sessionError: unknown = null;
          const finishUrl = (url: string) => {
            if (settled) return;
            settled = true;
            if (graceTimer) clearTimeout(graceTimer);
            sub.remove();
            resolve({ url });
          };
          const finishWithoutCode = () => {
            if (settled) return;
            settled = true;
            sub.remove();
            resolve({ url: null, error: sessionError });
          };
          // Only settle on a deep link that actually carries the OAuth `code` —
          // an unrelated universal/notification link arriving mid-session must
          // not consume the promise and drop the real redirect.
          const sub = Linking.addEventListener("url", (e) => {
            if (codeFromUrl(e.url)) finishUrl(e.url);
          });
          // When the session hands back a URL with the code, use it immediately.
          // Otherwise DON'T settle right away: on a cold iOS session the
          // ASWebAuthenticationSession frequently resolves as "dismiss"/"cancel"
          // even though the redirect fired, and the OS then delivers
          // theshedmobile://…?code= to the Linking listener a beat later.
          // Settling immediately (the old behaviour) removed the listener and
          // dropped that first-try code — the bug where the user had to tap Sign
          // in twice. Give the listener a short grace window before giving up.
          const startGrace = () => {
            if (settled || graceTimer) return;
            graceTimer = setTimeout(finishWithoutCode, REDIRECT_GRACE_MS);
          };
          void openAuthSessionAsync(redirect.toString(), redirectTo).then(
            (result) => {
              if (result.type === "success" && codeFromUrl(result.url)) {
                finishUrl(result.url);
              } else {
                // cancel / dismiss / success-without-code: user-driven, no error.
                startGrace();
              }
            },
            (e) => {
              // The session itself failed — hold the code error in case the grace
              // window recovers a deep-link code anyway; otherwise surface it.
              sessionError = e;
              startGrace();
            }
          );
        }
      );
      const code = outcome.url ? codeFromUrl(outcome.url) : null;
      if (code) {
        // On success the app flips to Authenticated and this screen unmounts, so
        // stay busy rather than flicker back to clickable.
        await signIn("google", { code });
        return;
      }
      // A real session failure with no recovered code — surface it rather than
      // silently re-enabling as if the user had just cancelled.
      if (outcome.error) throw outcome.error;
      // No redirect captured, or the user dismissed the browser — re-enable.
      setBusy(false);
    } catch (e) {
      setError(errorMessage(e));
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
