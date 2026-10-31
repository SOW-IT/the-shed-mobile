import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { requireOptionalNativeModule } from "expo";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorReporter } from "@/components/ErrorReporter";
import { OtaUpdateBanner } from "@/components/OtaUpdateBanner";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { AppDrawer, NavDrawerProvider } from "@/components/nav/NavDrawer";
import { useWideLayout } from "@/components/nav/layout";
import { FONT_SOURCES } from "@/fonts";
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
  const { busy, error, rejected, clearError, clearRejected } =
    useWebAuthCodeExchange();
  useEffect(() => {
    if (error && typeof window !== "undefined") {
      window.alert(`Sign-in didn't finish\n\n${error}`);
      clearError();
    }
  }, [error, clearError]);
  useEffect(() => {
    if (!rejected || typeof window === "undefined") return;
    window.alert(
      "SOW account required\n\nOnly SOW organisation accounts can sign in here."
    );
    clearRejected();
  }, [rejected, clearRejected]);
  return isLoading || busy ? <LoadingState /> : <RootStack />;
};

const RootStack = () => {
  const wide = useWideLayout();
  const { isAuthenticated } = useConvexAuth();
  return (
    <NavDrawerProvider>
      <View style={rootStackStyles.row}>
        {wide ? <AppSidebar /> : null}
        <View style={rootStackStyles.screens}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: "slide_from_right",
              animationDuration: durations.screen,
              gestureEnabled: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="person/[email]" />
            <Stack.Screen name="request/[id]" />
            <Stack.Screen name="design-requests/new" />
            <Stack.Screen name="design-requests/[id]" />
            <Stack.Screen name="grievances/new" />
            <Stack.Screen name="grievances/[id]" />
            <Stack.Screen name="event-requests/new" />
            <Stack.Screen name="event-requests/[id]/index" />
            <Stack.Screen name="event-requests/[id]/[form]" />
            <Stack.Screen name="attendance/event/[eventId]" />
            <Stack.Screen name="attendance/member/[key]" />
            <Stack.Screen name="review" />
            <Stack.Screen name="edit-home" />
            <Stack.Screen name="announcements/index" />
            <Stack.Screen name="announcements/[id]" />
            <Stack.Screen name="all" />
            <Stack.Screen name="checkin/[token]" />
            <Stack.Screen name="e2e-auth" />
          </Stack>
        </View>
      </View>
      {!wide && isAuthenticated ? <AppDrawer /> : null}
    </NavDrawerProvider>
  );
};

const rootStackStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  screens: { flex: 1 },
});

export default function RootLayout() {
  useEffect(() => {
    void DevMenuPreferences?.setPreferencesAsync({ showFloatingActionButton: false });
  }, []);
  const [fontsLoaded, fontError] = useFonts(FONT_SOURCES);
  const fontsReady = fontsLoaded || fontError !== null;
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
            {!fontsReady ? null : convex ? (
              <ConvexAuthProvider
                client={convex}
                storage={Platform.OS === "web" ? undefined : secureStorage}
                shouldHandleCode={Platform.OS !== "web"}
              >
                <AuthGate />
                <ErrorReporter />
                <AppUpdatePrompt />
                <OtaUpdateBanner />
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
