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
import { ActivityIndicator, ColorValue, Image, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SignInScreen } from "@/components/SignInScreen";
import { usePushRegistration } from "@/hooks/usePushRegistration";
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

const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? filled : outline} size={23} color={color} />
  );

/**
 * Requests tab icon: renders a red review-count badge and a white unread-
 * comments badge side-by-side so both counts are visible at a glance without
 * one hiding behind the other.
 */
const RequestsTabIcon = ({
  color,
  focused,
  reviewCount,
  unreadComments,
}: {
  color: ColorValue;
  focused: boolean;
  reviewCount: number;
  unreadComments: number;
}) => {
  const t = useAppTheme();
  const hasBadges = reviewCount > 0 || unreadComments > 0;
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name={focused ? "receipt" : "receipt-outline"} size={23} color={color} />
      {hasBadges && (
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -20,
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
          }}
        >
          {reviewCount > 0 && (
            <View
              style={{
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
                {reviewCount > 99 ? "99+" : reviewCount}
              </Text>
            </View>
          )}
          {unreadComments > 0 && (
            <View
              style={{
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#ffffff",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 3,
                borderWidth: 1,
                borderColor: "#cccccc",
              }}
            >
              <Text style={{ color: "#333333", fontSize: 10, fontWeight: "800" }}>
                {unreadComments > 99 ? "99+" : unreadComments}
              </Text>
            </View>
          )}
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
  // Separate white badge: unread comments on the user's own requests.
  const unreadComments =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;
  return (
    <Tabs
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
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          shadowColor: t.dark ? "#000000" : "#0F2523",
          shadowOpacity: t.dark ? 0.35 : 0.08,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
          elevation: 12,
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
              reviewCount={reviewCount}
              unreadComments={unreadComments}
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
  if (!convex) {
    return (
      <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
        <StatusBar style="auto" />
        <View style={{ flex: 1, backgroundColor: t.background }} />
      </ThemeProvider>
    );
  }
  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <ErrorBoundary>
      <ConvexAuthProvider
        client={convex}
        storage={Platform.OS === "web" ? undefined : secureStorage}
        shouldHandleCode={Platform.OS !== "web"}
      >
        <AuthLoading>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              backgroundColor: t.background,
            }}
          >
            <Image
              source={
                t.dark
                  ? require("../../assets/images/mark-cream.png")
                  : require("../../assets/images/mark-dark.png")
              }
              style={{ width: 56, height: 56 }}
              resizeMode="contain"
            />
            <ActivityIndicator size="small" color={t.muted} />
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
