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
import { ColorValue, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SignInScreen } from "@/components/SignInScreen";
import { LoadingState } from "@/components/ui";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { BOTTOM_TAB_HEIGHT, shadowStyle, useAppTheme } from "@/theme";
import { requestFullyApproved } from "../../shared/flow";

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

const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) => {
    const TabBarIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Ionicons name={focused ? filled : outline} size={23} color={color} />
    );
    return TabBarIcon;
  };

/**
 * Requests tab icon: single combined badge summing every action-required count
 * and every unread-message count across all segments (Mine + To Review).
 */
const RequestsTabIcon = ({
  color,
  focused,
  total,
}: {
  color: ColorValue;
  focused: boolean;
  total: number;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name={focused ? "receipt" : "receipt-outline"} size={23} color={color} />
      {total > 0 && (
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: t.warning,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "800" }}>
            {total > 99 ? "99+" : total}
          </Text>
        </View>
      )}
    </View>
  );
};

const AppTabs = () => {
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  usePushRegistration();
  // Mine: action count (requests fully approved but awaiting receipt submission).
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  const mineActionCount = (myRequests ?? []).filter(
    (r) => requestFullyApproved(r) && !r.receipt
  ).length;
  // Mine: unread comment count across the user's own requests.
  const mineUnread =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;

  // To Review: action count (requests waiting on the approver).
  // Convex dedupes this subscription with the Requests tab's own query.
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  const reviewActionCount = review
    ? review.hod.length +
      review.budgetManager.length +
      review.director.length +
      review.financeHead.length +
      review.readyToPay.length
    : 0;
  // To Review: unread comment count across the review queue.
  const reviewRequestIds = review
    ? [
        ...review.hod.map((r) => r._id),
        ...review.budgetManager.map((r) => r._id),
        ...review.director.map((r) => r._id),
        ...review.financeHead.map((r) => r._id),
        ...review.readyToPay.map((r) => r._id),
      ]
    : [];
  const reviewUnread =
    useQuery(
      api.comments.unreadTotalForRequests,
      me?.profile && me.isApprover && review ? { requestIds: reviewRequestIds } : "skip"
    ) ?? 0;

  // Combined tab badge: every action + every unread message across both segments.
  const tabTotal = mineActionCount + mineUnread + reviewActionCount + reviewUnread;
  return (
    <Tabs
      // Back (browser back / Android hardware back) returns to the last
      // visited tab rather than always the first tab. This makes back from a
      // hidden screen like person/[email] (opened from the Org Chart tab)
      // return to /org instead of the default firstRoute (/).
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.faint,
        tabBarBadgeStyle: {
          backgroundColor: t.accent,
          color: "#ffffff",
          fontSize: 11,
          fontWeight: "700",
        },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopWidth: 0,
          height: BOTTOM_TAB_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          ...shadowStyle(t.dark ? "#000000" : "#0F2523", t.dark ? 0.35 : 0.08, 16, -4, 12),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Requests",
          tabBarIcon: ({ color, focused }) => (
            <RequestsTabIcon
              color={color}
              focused={focused}
              total={tabTotal}
            />
          ),
          // Both counts are rendered inline by RequestsTabIcon; no tabBarBadge needed.
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
          // Admins get the full Manage screen; the Finance Head gets a
          // restricted view (Budget Manager only).
          href: me?.isAdmin || me?.isFinanceHead ? "/admin" : null,
          tabBarIcon: tabIcon("settings-outline", "settings"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          // Removed from the bottom bar; still reachable via the TopBar avatar.
          href: null,
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
              <AppTabs />
            </Authenticated>
          </ConvexAuthProvider>
        </ErrorBoundary>
      </View>
    </ThemeProvider>
  );
}
