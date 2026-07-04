import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebAuthCodeExchange } from "@/hooks/useGoogleSignIn";
import { LoadingState } from "@/components/ui";
import { useAppTheme } from "@/theme";

const convex = process.env.EXPO_PUBLIC_CONVEX_URL
  ? new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL, {
      unsavedChangesWarning: false,
    })
  : null;

// Tokens live in the platform keychain on device; localStorage on web.
// AFTER_FIRST_UNLOCK keeps items readable after the first device unlock
// post-restart, so the app stays signed in after backgrounding or reboot.
const secureStorage = {
  getItem: (key: string) =>
    SecureStore.getItemAsync(key, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

/**
 * Root navigator: the bottom tabs plus the detail screens that push *over* them
 * as cards. A native stack gives those detail screens (profile, a person, a
 * request) an interactive swipe-back gesture that reveals the previous screen
 * underneath as you drag.
 */
/**
 * Shown when `EXPO_PUBLIC_CONVEX_URL` is missing so the app can't build a Convex
 * client. Without this the render fell through to `null` — a blank screen that's
 * indistinguishable from the silent startup crash this release is fixing. Fixed
 * brand colours so it renders correctly even if a provider above it is broken.
 */
const ConfigurationErrorScreen = () => (
  <View style={configErrorStyles.container}>
    <Text style={configErrorStyles.title}>Configuration error</Text>
    <Text style={configErrorStyles.message}>
      Missing Convex configuration. Set EXPO_PUBLIC_CONVEX_URL and rebuild.
    </Text>
  </View>
);

const configErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#F5F3E3", // brand cream
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0F2523" },
  message: { color: "#5C6B62", textAlign: "center" },
});

/**
 * The app shell rendered for BOTH signed-in and signed-out users (1.7.0): the
 * public surfaces (Home, Org chart, person profiles) work without an account,
 * and signing in via the top-bar avatar reveals the staff tabs in place — one
 * navigator across the auth flip, so the user stays where they are. Only the
 * initial auth handshake shows a loading state.
 */
const AuthGate = () => {
  const { isLoading } = useConvexAuth();
  // On web this hook is what drives the `?code=` exchange after the Google
  // redirect lands. Hold the loading state while it runs so we don't flash the
  // signed-out shell before auth resolves, and surface a failed exchange
  // (expired / re-used code) instead of silently dropping the visitor.
  const { busy, error } = useWebAuthCodeExchange();
  useEffect(() => {
    if (error) Alert.alert("Sign-in didn't finish", error);
  }, [error]);
  return isLoading || busy ? <LoadingState /> : <RootStack />;
};

const RootStack = () => (
  <Stack
    screenOptions={{
      headerShown: false,
      animation: "slide_from_right",
      gestureEnabled: true,
    }}
  >
    <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
    <Stack.Screen name="profile" />
    <Stack.Screen name="notifications" />
    <Stack.Screen name="person/[email]" />
    <Stack.Screen name="request/[id]" />
    {/* Attendance: sub-group events + the roll-call itself, pushed over the tabs. */}
    <Stack.Screen name="attendance/[subgroup]" />
    <Stack.Screen name="attendance/event/new" />
    <Stack.Screen name="attendance/event/[eventId]" />
    {/* Folded into the Requests tab; routes survive for old deep links. */}
    <Stack.Screen name="review" />
    <Stack.Screen name="all" />
  </Stack>
);

export default function RootLayout() {
  const t = useAppTheme();
  const baseTheme = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    colors: { ...baseTheme.colors, background: t.background },
  };
  const background = Platform.OS === "web" ? "transparent" : t.background;
  // ErrorBoundary is the OUTERMOST wrapper so a render error anywhere below —
  // including in the gesture-handler / theme / auth providers, not just the
  // screens — shows the fallback instead of a blank screen or a hard crash. Its
  // fallback uses fixed brand colours, so it renders fine without ThemeProvider.
  return (
    <ErrorBoundary>
      {/* Root host for react-native-gesture-handler so the roll-call swipe rows
          receive touches (required on native; harmless on web). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ThemeProvider value={navTheme}>
          <StatusBar style="auto" />
          <View style={{ flex: 1, backgroundColor: background }}>
            {convex ? (
              <ConvexAuthProvider
                client={convex}
                storage={Platform.OS === "web" ? undefined : secureStorage}
                shouldHandleCode={Platform.OS !== "web"}
              >
                <AuthGate />
              </ConvexAuthProvider>
            ) : (
              <ConfigurationErrorScreen />
            )}
          </View>
        </ThemeProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
