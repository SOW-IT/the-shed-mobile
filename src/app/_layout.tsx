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
import { ActivityIndicator, Platform, View } from "react-native";
import { api } from "../../convex/_generated/api";
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

const AppTabs = () => {
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  usePushRegistration();
  // Badge: how many requests are waiting on the signed-in approver. Convex
  // dedupes this subscription with the To Review screen's own query.
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
    <Tabs screenOptions={{ tabBarActiveTintColor: t.primary }}>
      <Tabs.Screen name="index" options={{ title: "My Requests" }} />
      <Tabs.Screen name="org" options={{ title: "Org Chart" }} />
      <Tabs.Screen
        name="review"
        options={{
          title: "To Review",
          href: me?.isApprover ? "/review" : null,
          tabBarBadge: reviewCount > 0 ? reviewCount : undefined,
        }}
      />
      <Tabs.Screen
        name="all"
        options={{ title: "All Requests", href: me?.isFinance ? "/all" : null }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: "Admin", href: me?.isAdmin ? "/admin" : null }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
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
    </ThemeProvider>
  );
}
