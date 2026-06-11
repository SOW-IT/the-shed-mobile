import { Ionicons } from "@expo/vector-icons";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, ColorValue, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SignInScreen } from "@/components/SignInScreen";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useAppTheme } from "@/theme";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// Tokens live in the platform keychain on device; localStorage on web.
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={24} color={color} />
  );

const AppTabs = () => {
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  usePushRegistration();
  // Badge: how many requests are waiting on the signed-in approver. Convex
  // dedupes this subscription with the Requests tab's own query.
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  const reviewCount = review
    ? review.hod.length +
      review.budgetManager.length +
      review.director.length +
      review.financeHead.length +
      review.readyToPay.length
    : 0;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        // An explicit lineHeight stops the label flex-shrinking to a sliver
        // (clipped text) when the item runs out of room below the 24px icon.
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", lineHeight: 14 },
        // Tall enough that labels never clip; the default bar height leaves
        // no room for them below 24px icons on web/Android.
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
          height: 64 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Requests",
          tabBarIcon: tabIcon("receipt-outline", "receipt"),
          tabBarBadge: reviewCount > 0 ? reviewCount : undefined,
        }}
      />
      <Tabs.Screen
        name="org"
        options={{
          title: "Org Chart",
          tabBarIcon: tabIcon("people-outline", "people"),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: me?.isAdmin ? "/admin" : null,
          tabBarIcon: tabIcon("settings-outline", "settings"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: tabIcon("person-circle-outline", "person-circle"),
        }}
      />
      {/* Folded into the Requests tab; routes survive for old deep links. */}
      <Tabs.Screen name="review" options={{ href: null }} />
      <Tabs.Screen name="all" options={{ href: null }} />
      {/* Opened by tapping a person in the org chart; not a tab itself. */}
      <Tabs.Screen name="person/[email]" options={{ title: "Profile", href: null }} />
      {/* Opened by tapping a push notification; not a tab itself. */}
      <Tabs.Screen name="request/[id]" options={{ title: "Request", href: null }} />
    </Tabs>
  );
};

export default function RootLayout() {
  const t = useAppTheme();
  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <ErrorBoundary>
      <ConvexAuthProvider
        client={convex}
        storage={Platform.OS === "web" ? undefined : secureStorage}
      >
        <AuthLoading>
          <View
            style={{ flex: 1, justifyContent: "center", backgroundColor: t.background }}
          >
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        </AuthLoading>
        <Unauthenticated>
          <SignInScreen />
        </Unauthenticated>
        <Authenticated>
          <AppTabs />
        </Authenticated>
      </ConvexAuthProvider>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
