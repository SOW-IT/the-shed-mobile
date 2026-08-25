import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { requireOptionalNativeModule } from "expo";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWebAuthCodeExchange } from "@/hooks/useGoogleSignIn";
import { LoadingState } from "@/components/ui";
import { durations, useAppTheme } from "@/theme";

const DevMenuPreferences = requireOptionalNativeModule("DevMenuPreferences");

const convex = process.env.EXPO_PUBLIC_CONVEX_URL
  ? new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL, {
      unsavedChangesWarning: false,
    })
  : null;

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
    backgroundColor: "#F5F3E3",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0F2523" },
  message: { color: "#5C6B62", textAlign: "center" },
});

const AuthGate = () => {
  const { isLoading } = useConvexAuth();
  const { busy, error, rejectedProvider, clearError, clearRejected } =
    useWebAuthCodeExchange();
  useEffect(() => {
    if (error && typeof window !== "undefined") {
      window.alert(`Sign-in didn't finish\n\n${error}`);
      clearError();
    }
  }, [error, clearError]);
  useEffect(() => {
    if (!rejectedProvider || typeof window === "undefined") return;
    window.alert(
      rejectedProvider === "googlePersonal"
        ? "Use your SOW account\n\nThat looks like a SOW organisation account. Please use “Sign in with your SOW account” to sign in with it."
        : "SOW account required\n\nOnly SOW organisation accounts can sign in here. To browse as a guest, use “Sign in with Google” instead."
    );
    clearRejected();
  }, [rejectedProvider, clearRejected]);
  return isLoading || busy ? <LoadingState /> : <RootStack />;
};

const RootStack = () => (
  <Stack
    screenOptions={{
      headerShown: false,
      animation: "slide_from_right",
      animationDuration: durations.screen,
      gestureEnabled: true,
    }}
  >
    <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
    <Stack.Screen name="profile" />
    <Stack.Screen name="notifications" />
    <Stack.Screen name="person/[email]" />
    <Stack.Screen name="request/[id]" />
    <Stack.Screen name="attendance/[subgroup]" />
    <Stack.Screen name="attendance/event/new" />
    <Stack.Screen name="attendance/event/[eventId]" />
    <Stack.Screen name="review" />
    <Stack.Screen name="all" />
    <Stack.Screen name="e2e-auth" />
  </Stack>
);

export default function RootLayout() {
  useEffect(() => {
    void DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });
  }, []);
  const t = useAppTheme();
  const baseTheme = t.dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...baseTheme,
    colors: { ...baseTheme.colors, background: t.background },
  };
  const background = Platform.OS === "web" ? "transparent" : t.background;
  return (
    <ErrorBoundary>
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
