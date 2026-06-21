import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, ConvexReactClient, Unauthenticated } from "convex/react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SignInScreen } from "@/components/SignInScreen";
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
  if (!convex) {
    return (
      <ThemeProvider value={navTheme}>
        <StatusBar style="auto" />
        <View style={{ flex: 1, backgroundColor: Platform.OS === "web" ? "transparent" : t.background }} />
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <View style={{ flex: 1, backgroundColor: Platform.OS === "web" ? "transparent" : t.background }}>
        <ErrorBoundary>
          <ConvexAuthProvider
            client={convex}
            storage={Platform.OS === "web" ? undefined : secureStorage}
            shouldHandleCode={Platform.OS !== "web"}
          >
            <AuthLoading>
              <LoadingState />
            </AuthLoading>
            <Unauthenticated>
              <SignInScreen />
            </Unauthenticated>
            <Authenticated>
              <RootStack />
            </Authenticated>
          </ConvexAuthProvider>
        </ErrorBoundary>
      </View>
    </ThemeProvider>
  );
}
