import { AppUpdatePrompt } from "@/components/AppUpdatePrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorReporter } from "@/components/ErrorReporter";
import { OtaAutoUpdate } from "@/components/OtaAutoUpdate";
import { DevotionalSync } from "@/components/devotionals/DevotionalSync";
import { GameScoreSync } from "@/components/games/GameScoreSync";
import { OfflineGames, OfflineScreen } from "@/components/games/OfflineGames";
import { OfflinePill } from "@/components/games/OfflinePill";
import { AppSidebar } from "@/components/nav/AppSidebar";
import { AppDrawer, NavDrawerProvider } from "@/components/nav/NavDrawer";
import { useWideLayout } from "@/components/nav/layout";
import { LoadingState } from "@/components/ui";
import { FONT_SOURCES } from "@/fonts";
import { useWebAuthCodeExchange } from "@/hooks/useGoogleSignIn";
import { useOffline } from "@/hooks/useOffline";
import { durations, useAppTheme } from "@/theme";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient, useConvexAuth } from "convex/react";
import { requireOptionalNativeModule } from "expo";
import { useFonts } from "expo-font";
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  usePathname,
} from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Modal, Platform, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { CONVEX_URL } from "@/env";
import { notify } from "@/lib/notify";

const DevMenuPreferences = requireOptionalNativeModule("DevMenuPreferences");

const convex = CONVEX_URL
  ? new ConvexReactClient(CONVEX_URL, {
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

const ConfigurationErrorScreen = () => {
  const t = useAppTheme();
  return (
    <View style={[configErrorStyles.container, { backgroundColor: t.background }]}>
      <Text style={[configErrorStyles.title, { color: t.text }]}>Configuration error</Text>
      <Text style={[configErrorStyles.message, { color: t.muted }]}>
        Missing Convex configuration. Set EXPO_PUBLIC_CONVEX_URL and rebuild.
      </Text>
    </View>
  );
};

const configErrorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "800" },
  message: { textAlign: "center" },
});

const AuthGate = () => {
  const pathname = usePathname();
  const { isLoading } = useConvexAuth();
  const { busy, error, rejected, clearError, clearRejected } =
    useWebAuthCodeExchange();
  const offline = useOffline();
  const [playingOffline, setPlayingOffline] = useState(false);
  useEffect(() => {
    if (error && typeof window !== "undefined") {
      notify("Sign-in didn't finish", error);
      clearError();
    }
  }, [error, clearError]);
  useEffect(() => {
    if (!rejected || typeof window === "undefined") return;
    notify("SOW account required", "Only SOW organisation accounts can sign in here.");
    clearRejected();
  }, [rejected, clearRejected]);
  // Allow Spotify OAuth callbacks to render immediately.
  // Spotify authorization is handled separately from SHED authentication.
  if (pathname === "/spotify-callback") {
    return <RootStack />;
  }

  // Signed in but offline, the app would wait here for good. Offer the games.
  if (playingOffline) {
    return <OfflineGames online={!isLoading && !busy && !offline} onLeave={() => setPlayingOffline(false)} />;
  }
  if ((isLoading || busy) && offline) return <OfflineScreen onPlay={() => setPlayingOffline(true)} />;
  return isLoading || busy ? <LoadingState /> : <RootStack />;
};

const RootStack = () => {
  const wide = useWideLayout();
  // The games are full screen: no sidebar beside them.
  const inGames = usePathname().startsWith("/games");
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const [playingOffline, setPlayingOffline] = useState(false);
  return (
    <NavDrawerProvider>
      <View style={rootStackStyles.row}>
        {wide && !inGames ? <AppSidebar /> : null}
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
            <Stack.Screen name="calendar-history" />
            <Stack.Screen name="edit-home" />
            <Stack.Screen name="announcements/[id]" />
            <Stack.Screen name="all" />
            <Stack.Screen name="checkin/[token]" />
            <Stack.Screen name="e2e-auth" />
            {/* No swipe back out of the World: you leave by tapping Leave in
                its menu. The hardware and browser back ask first (usePreventRemove). */}
            <Stack.Screen name="world" options={{ gestureEnabled: false }} />
            <Stack.Screen name="world-calendar" />
            <Stack.Screen name="world-praise" />
            <Stack.Screen name="world-devotionals" />
            <Stack.Screen name="devotionals/[date]" />
            <Stack.Screen name="devotionals/groups/[id]" />
            <Stack.Screen name="games/index" />
            {/* No swipe back from a game: a sideways swipe is a move in the game
                (Sky Shooter steers that way). The back button at the top left is
                the way out, and it asks first during a run. */}
            <Stack.Screen name="games/[game]" options={{ gestureEnabled: false }} />
            <Stack.Screen name="games/leaderboard" />
            <Stack.Screen
              name="spotify-callback"
              options={{
                headerShown: false,
                animation: "none",
                gestureEnabled: false,
              }}
            />
          </Stack>
        </View>
      </View>
      <OfflinePill onPlay={() => setPlayingOffline(true)} />
      {!wide && isAuthenticated ? <AppDrawer /> : null}
      {/* A modal over the app rather than a route: offline, a web page can't
          fetch a route it hasn't loaded. The modal keeps focus inside it. */}
      <Modal
        visible={playingOffline}
        animationType="fade"
        onRequestClose={() => setPlayingOffline(false)}
      >
        {/* A modal is its own window on iOS: measure its safe area again. */}
        <SafeAreaProvider>
          <OfflineGames online={!offline} onLeave={() => setPlayingOffline(false)} canClose />
        </SafeAreaProvider>
      </Modal>
    </NavDrawerProvider>
  );
};

const rootStackStyles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  screens: { flex: 1 },
});

export default function RootLayout() {
  useEffect(() => {
    void DevMenuPreferences?.setPreferencesAsync({
      showFloatingActionButton: false,
    });
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
                <GameScoreSync />
                <DevotionalSync />
                <AppUpdatePrompt />
                <OtaAutoUpdate />
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
